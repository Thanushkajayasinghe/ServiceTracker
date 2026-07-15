const express = require('express');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Helper to verify vehicle belongs to user
async function verifyVehicleOwnership(vehicleId, userId) {
  const result = await pool.query(
    'SELECT id FROM vehicles WHERE id = $1 AND user_id = $2',
    [vehicleId, userId]
  );
  return result.rows.length > 0;
}

// Helper to calculate due_date and due_km
function calculateDueFields(lastDoneDate, intervalMonths, lastDoneKm, intervalKm) {
  let dueDate = null;
  let dueKm = null;

  if (lastDoneDate && intervalMonths) {
    const baseDate = new Date(lastDoneDate);
    baseDate.setMonth(baseDate.getMonth() + parseInt(intervalMonths));
    dueDate = baseDate.toISOString().split('T')[0];
  }

  if (lastDoneKm !== undefined && lastDoneKm !== null && intervalKm) {
    dueKm = parseInt(lastDoneKm) + parseInt(intervalKm);
  }

  return { dueDate, dueKm };
}

// GET /api/reminders
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { vehicleId } = req.query;

    let queryText = `
      SELECT 
        r.*,
        v.nickname AS vehicle_nickname,
        v.type AS vehicle_type
      FROM reminders r
      JOIN vehicles v ON v.id = r.vehicle_id
      WHERE v.user_id = $1
    `;
    const params = [userId];

    if (vehicleId) {
      params.push(vehicleId);
      queryText += ` AND r.vehicle_id = $${params.length}`;
    }

    queryText += ' ORDER BY r.due_date ASC NULLS LAST, r.due_km ASC NULLS LAST';

    const result = await pool.query(queryText, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get reminders error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/reminders
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      vehicleId,
      reminderType,
      customName,
      intervalKm,
      intervalMonths,
      lastDoneKm,
      lastDoneDate,
      isActive,
    } = req.body;

    if (!vehicleId || !reminderType) {
      return res.status(400).json({ error: 'Vehicle ID and reminder type are required.' });
    }

    const owned = await verifyVehicleOwnership(vehicleId, req.user.id);
    if (!owned) {
      return res.status(404).json({ error: 'Vehicle not found.' });
    }

    const { dueDate, dueKm } = calculateDueFields(
      lastDoneDate,
      intervalMonths,
      lastDoneKm,
      intervalKm
    );

    const result = await pool.query(
      `INSERT INTO reminders 
        (vehicle_id, reminder_type, custom_name, interval_km, interval_months, last_done_km, last_done_date, due_km, due_date, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        vehicleId,
        reminderType,
        customName || null,
        intervalKm ? parseInt(intervalKm) : null,
        intervalMonths ? parseInt(intervalMonths) : null,
        lastDoneKm !== undefined && lastDoneKm !== null && lastDoneKm !== '' ? parseInt(lastDoneKm) : null,
        lastDoneDate || null,
        dueKm,
        dueDate,
        isActive !== undefined ? isActive : true,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create reminder error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT /api/reminders/:id
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      vehicleId,
      reminderType,
      customName,
      intervalKm,
      intervalMonths,
      lastDoneKm,
      lastDoneDate,
      isActive,
    } = req.body;

    // Check ownership of the reminder's vehicle
    const existing = await pool.query(
      `SELECT r.* FROM reminders r
       JOIN vehicles v ON v.id = r.vehicle_id
       WHERE r.id = $1 AND v.user_id = $2`,
      [id, req.user.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Reminder not found.' });
    }

    const reminder = existing.rows[0];
    const targetVehicleId = vehicleId || reminder.vehicle_id;

    // If changing vehicle, check ownership of new vehicle
    if (vehicleId && vehicleId !== reminder.vehicle_id) {
      const owned = await verifyVehicleOwnership(vehicleId, req.user.id);
      if (!owned) {
        return res.status(404).json({ error: 'New vehicle not found.' });
      }
    }

    const finalLastDoneDate = lastDoneDate !== undefined ? lastDoneDate : reminder.last_done_date;
    const finalIntervalMonths = intervalMonths !== undefined ? intervalMonths : reminder.interval_months;
    const finalLastDoneKm = lastDoneKm !== undefined ? lastDoneKm : reminder.last_done_km;
    const finalIntervalKm = intervalKm !== undefined ? intervalKm : reminder.interval_km;

    const { dueDate, dueKm } = calculateDueFields(
      finalLastDoneDate,
      finalIntervalMonths,
      finalLastDoneKm,
      finalIntervalKm
    );

    const result = await pool.query(
      `UPDATE reminders SET
        vehicle_id = $1,
        reminder_type = $2,
        custom_name = $3,
        interval_km = $4,
        interval_months = $5,
        last_done_km = $6,
        last_done_date = $7,
        due_km = $8,
        due_date = $9,
        is_active = $10,
        updated_at = NOW()
       WHERE id = $11
       RETURNING *`,
      [
        targetVehicleId,
        reminderType || reminder.reminder_type,
        customName !== undefined ? (customName || null) : reminder.custom_name,
        finalIntervalKm ? parseInt(finalIntervalKm) : null,
        finalIntervalMonths ? parseInt(finalIntervalMonths) : null,
        finalLastDoneKm !== undefined && finalLastDoneKm !== null && finalLastDoneKm !== '' ? parseInt(finalLastDoneKm) : null,
        finalLastDoneDate || null,
        dueKm,
        dueDate,
        isActive !== undefined ? isActive : reminder.is_active,
        id,
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update reminder error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /api/reminders/:id
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check ownership
    const existing = await pool.query(
      `SELECT r.id FROM reminders r
       JOIN vehicles v ON v.id = r.vehicle_id
       WHERE r.id = $1 AND v.user_id = $2`,
      [id, req.user.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Reminder not found.' });
    }

    await pool.query('DELETE FROM reminders WHERE id = $1', [id]);
    res.json({ message: 'Reminder deleted successfully.' });
  } catch (err) {
    console.error('Delete reminder error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
