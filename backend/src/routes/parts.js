const express = require('express');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/parts?search=filter&vehicleId=abc&limit=20&page=1
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { search, vehicleId } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    let queryParams = [userId];
    let queryText = `
      SELECT 
        si.id,
        si.description,
        si.cost,
        sr.id AS record_id,
        sr.service_date,
        sr.odometer_reading,
        sr.service_center,
        sr.service_type,
        v.id AS vehicle_id,
        v.nickname AS vehicle_nickname,
        v.make AS vehicle_make,
        v.model AS vehicle_model
      FROM service_items si
      JOIN service_records sr ON sr.id = si.record_id
      JOIN vehicles v ON v.id = sr.vehicle_id
      WHERE v.user_id = $1
    `;

    if (search) {
      queryParams.push(`%${search}%`);
      queryText += ` AND si.description ILIKE $${queryParams.length}`;
    }

    if (vehicleId) {
      queryParams.push(vehicleId);
      queryText += ` AND v.id = $${queryParams.length}`;
    }

    queryText += ` ORDER BY sr.service_date DESC, sr.odometer_reading DESC`;

    // Add LIMIT and OFFSET. Request limit + 1 to check if there are more records
    queryParams.push(limit + 1);
    queryText += ` LIMIT $${queryParams.length}`;

    queryParams.push(offset);
    queryText += ` OFFSET $${queryParams.length}`;

    const result = await pool.query(queryText, queryParams);
    const rows = result.rows;

    const hasMore = rows.length > limit;
    const paginatedRows = hasMore ? rows.slice(0, limit) : rows;

    res.json({
      data: paginatedRows,
      hasMore,
      page,
    });
  } catch (err) {
    console.error('Parts query error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
