const express = require('express');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard?year=2025
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const currentYear = new Date().getFullYear();
    const selectedYear = parseInt(req.query.year) || currentYear;

    // Total vehicles
    const vehicleCountResult = await pool.query(
      'SELECT COUNT(*) as count FROM vehicles WHERE user_id = $1',
      [userId]
    );

    // Money spent in selected year
    const yearSpendResult = await pool.query(
      `SELECT COALESCE(SUM(sr.total_cost), 0) AS total
       FROM service_records sr
       JOIN vehicles v ON v.id = sr.vehicle_id
       WHERE v.user_id = $1 AND EXTRACT(YEAR FROM sr.service_date) = $2`,
      [userId, selectedYear]
    );

    // Total money spent all time
    const allTimeSpendResult = await pool.query(
      `SELECT COALESCE(SUM(sr.total_cost), 0) AS total
       FROM service_records sr
       JOIN vehicles v ON v.id = sr.vehicle_id
       WHERE v.user_id = $1`,
      [userId]
    );

    // Last service date across all vehicles
    const lastServiceResult = await pool.query(
      `SELECT sr.service_date, sr.service_center, v.nickname, v.type
       FROM service_records sr
       JOIN vehicles v ON v.id = sr.vehicle_id
       WHERE v.user_id = $1
       ORDER BY sr.service_date DESC LIMIT 1`,
      [userId]
    );

    // Service count for selected year
    const serviceCountResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM service_records sr
       JOIN vehicles v ON v.id = sr.vehicle_id
       WHERE v.user_id = $1 AND EXTRACT(YEAR FROM sr.service_date) = $2`,
      [userId, selectedYear]
    );

    // Available years (for year dropdown)
    const availableYearsResult = await pool.query(
      `SELECT DISTINCT EXTRACT(YEAR FROM sr.service_date)::int AS year
       FROM service_records sr
       JOIN vehicles v ON v.id = sr.vehicle_id
       WHERE v.user_id = $1
       ORDER BY year DESC`,
      [userId]
    );

    // Vehicle-level stats with reminders (always current/live data)
    const vehicleStatsResult = await pool.query(
      `SELECT 
        v.id, v.nickname, v.type, v.make, v.model, v.service_interval_km,
        last_rec.service_date AS last_service_date,
        last_rec.odometer_reading AS last_odometer,
        next_rec.next_service_km,
        next_rec.next_service_date,
        next_rec.last_service_odometer,
        last_rec.service_center AS last_service_center,
        COALESCE(total_cost.total, 0) AS total_spent,
        CURRENT_DATE - last_rec.service_date AS days_since_service
       FROM vehicles v
       LEFT JOIN LATERAL (
         SELECT * FROM service_records sr
         WHERE sr.vehicle_id = v.id
         ORDER BY sr.service_date DESC, sr.odometer_reading DESC LIMIT 1
       ) last_rec ON true
       LEFT JOIN LATERAL (
         SELECT next_service_km, next_service_date, odometer_reading AS last_service_odometer FROM service_records sr
         WHERE sr.vehicle_id = v.id AND COALESCE(sr.service_type, 'service') = 'service' AND sr.next_service_km IS NOT NULL
         ORDER BY sr.service_date DESC, sr.odometer_reading DESC LIMIT 1
       ) next_rec ON true
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(sr.total_cost), 0) AS total
         FROM service_records sr WHERE sr.vehicle_id = v.id
       ) total_cost ON true
       WHERE v.user_id = $1
       ORDER BY v.created_at`,
      [userId]
    );

    // Monthly spending for selected year
    const monthlySpendResult = await pool.query(
      `SELECT 
        EXTRACT(MONTH FROM sr.service_date)::int AS month,
        TO_CHAR(sr.service_date, 'Mon') AS month_name,
        COALESCE(SUM(sr.total_cost), 0) AS total
       FROM service_records sr
       JOIN vehicles v ON v.id = sr.vehicle_id
       WHERE v.user_id = $1 AND EXTRACT(YEAR FROM sr.service_date) = $2
       GROUP BY EXTRACT(MONTH FROM sr.service_date), TO_CHAR(sr.service_date, 'Mon')
       ORDER BY month`,
      [userId, selectedYear]
    );

    // Spending breakdown by service type (all time)
    const spendByTypeResult = await pool.query(
      `SELECT 
        COALESCE(sr.service_type, 'service') AS service_type,
        COALESCE(SUM(sr.total_cost), 0) AS total,
        COUNT(*) AS count
       FROM service_records sr
       JOIN vehicles v ON v.id = sr.vehicle_id
       WHERE v.user_id = $1
       GROUP BY COALESCE(sr.service_type, 'service')`,
      [userId]
    );

    // Spending breakdown by service type for selected year
    const spendByTypeYearResult = await pool.query(
      `SELECT 
        COALESCE(sr.service_type, 'service') AS service_type,
        COALESCE(SUM(sr.total_cost), 0) AS total,
        COUNT(*) AS count
       FROM service_records sr
       JOIN vehicles v ON v.id = sr.vehicle_id
       WHERE v.user_id = $1 AND EXTRACT(YEAR FROM sr.service_date) = $2
       GROUP BY COALESCE(sr.service_type, 'service')`,
      [userId, selectedYear]
    );

    // Build upcoming reminders
    const vehicles = vehicleStatsResult.rows;
    const reminders = vehicles
      .filter(v => v.last_service_date)
      .map(v => {
        const reminders = [];
        if (v.next_service_km) {
          reminders.push({
            vehicleId: v.id,
            vehicleNickname: v.nickname,
            vehicleType: v.type,
            type: 'mileage',
            nextServiceKm: v.next_service_km,
            // lastServiceOdometer: odometer from last SERVICE record (for label)
            lastOdometer: v.last_service_odometer,
            // currentOdometer: most recent odometer of any record type (for urgency)
            urgency: v.last_odometer && (v.next_service_km - v.last_odometer) <= 500 ? 'high' :
                     v.last_odometer && (v.next_service_km - v.last_odometer) <= 1000 ? 'medium' : 'low'
          });
        }
        if (v.next_service_date) {
          const daysUntil = Math.floor(
            (new Date(v.next_service_date) - new Date()) / (1000 * 60 * 60 * 24)
          );
          reminders.push({
            vehicleId: v.id,
            vehicleNickname: v.nickname,
            vehicleType: v.type,
            type: 'date',
            nextServiceDate: v.next_service_date,
            daysUntil,
            urgency: daysUntil <= 7 ? 'high' : daysUntil <= 30 ? 'medium' : 'low'
          });
        }
        return reminders;
      })
      .flat()
      .sort((a, b) => {
        const urgencyOrder = { high: 0, medium: 1, low: 2 };
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      });

    const lastService = lastServiceResult.rows[0] || null;
    const daysSinceLastService = lastService
      ? Math.floor((new Date() - new Date(lastService.service_date)) / (1000 * 60 * 60 * 24))
      : null;

    // Build years list — always include current year even if no records
    const years = availableYearsResult.rows.map(r => r.year);
    if (!years.includes(currentYear)) years.unshift(currentYear);

    res.json({
      selectedYear,
      availableYears: years,
      summary: {
        vehicleCount: parseInt(vehicleCountResult.rows[0].count),
        serviceCount: parseInt(serviceCountResult.rows[0].count),
        yearSpend: parseFloat(yearSpendResult.rows[0].total),
        allTimeSpend: parseFloat(allTimeSpendResult.rows[0].total),
        lastService: lastService ? {
          date: lastService.service_date,
          serviceCenter: lastService.service_center,
          vehicleNickname: lastService.nickname,
          vehicleType: lastService.type,
        } : null,
        daysSinceLastService,
      },
      vehicles: vehicleStatsResult.rows,
      reminders,
      monthlySpend: monthlySpendResult.rows,
      spendByType: spendByTypeResult.rows,
      spendByTypeYear: spendByTypeYearResult.rows,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
