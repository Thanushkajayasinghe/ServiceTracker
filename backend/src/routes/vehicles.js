const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();

// Multer setup for vehicle book uploads
const vehicleBookStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.env.UPLOAD_PATH || 'uploads', 'vehicle-books');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `vehicle-book-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage: vehicleBookStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and image files are allowed for vehicle book.'));
    }
  },
});

// GET /api/vehicles - list all vehicles with last service info
router.get('/', verifyToken, async (req, res) => {
  try {
    const { search, type } = req.query;

    let query = `
      SELECT 
        v.*,
        (SELECT sr.service_date FROM service_records sr 
         WHERE sr.vehicle_id = v.id 
         ORDER BY sr.service_date DESC, sr.odometer_reading DESC LIMIT 1) AS last_service_date,
        (SELECT sr.odometer_reading FROM service_records sr 
         WHERE sr.vehicle_id = v.id 
         ORDER BY sr.service_date DESC, sr.odometer_reading DESC LIMIT 1) AS last_odometer,
        (SELECT sr.next_service_km FROM service_records sr 
         WHERE sr.vehicle_id = v.id AND COALESCE(sr.service_type, 'service') = 'service' AND sr.next_service_km IS NOT NULL
         ORDER BY sr.service_date DESC, sr.odometer_reading DESC LIMIT 1) AS next_service_km,
        (SELECT sr.next_service_date FROM service_records sr 
         WHERE sr.vehicle_id = v.id AND COALESCE(sr.service_type, 'service') = 'service' AND sr.next_service_km IS NOT NULL
         ORDER BY sr.service_date DESC, sr.odometer_reading DESC LIMIT 1) AS next_service_date,
        (SELECT COALESCE(SUM(sr.total_cost), 0) FROM service_records sr 
         WHERE sr.vehicle_id = v.id) AS total_spent,
        (SELECT COUNT(*) FROM service_records sr WHERE sr.vehicle_id = v.id) AS service_count
      FROM vehicles v
      WHERE v.user_id = $1
    `;

    const params = [req.user.id];
    let paramIdx = 2;

    if (search) {
      query += ` AND (v.nickname ILIKE $${paramIdx} OR v.registration_number ILIKE $${paramIdx} OR v.make ILIKE $${paramIdx} OR v.model ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (type && ['car', 'bike'].includes(type)) {
      query += ` AND v.type = $${paramIdx}`;
      params.push(type);
      paramIdx++;
    }

    query += ' ORDER BY v.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get vehicles error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/vehicles/:id - single vehicle
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.*,
        (SELECT sr.service_date FROM service_records sr 
         WHERE sr.vehicle_id = v.id 
         ORDER BY sr.service_date DESC LIMIT 1) AS last_service_date,
        (SELECT sr.odometer_reading FROM service_records sr 
         WHERE sr.vehicle_id = v.id 
         ORDER BY sr.service_date DESC, sr.odometer_reading DESC LIMIT 1) AS last_odometer,
        (SELECT sr.next_service_km FROM service_records sr 
         WHERE sr.vehicle_id = v.id AND COALESCE(sr.service_type, 'service') = 'service' AND sr.next_service_km IS NOT NULL
         ORDER BY sr.service_date DESC LIMIT 1) AS next_service_km,
        (SELECT sr.next_service_date FROM service_records sr 
         WHERE sr.vehicle_id = v.id AND COALESCE(sr.service_type, 'service') = 'service' AND sr.next_service_km IS NOT NULL
         ORDER BY sr.service_date DESC LIMIT 1) AS next_service_date,
        (SELECT COALESCE(SUM(sr.total_cost), 0) FROM service_records sr 
         WHERE sr.vehicle_id = v.id) AS total_spent,
        (SELECT COUNT(*) FROM service_records sr WHERE sr.vehicle_id = v.id) AS service_count
       FROM vehicles v 
       WHERE v.id = $1 AND v.user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get vehicle error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/vehicles - create vehicle
router.post('/', verifyToken, upload.single('vehicleBook'), async (req, res) => {
  try {
    const {
      nickname, type, make, model, year, registrationNumber,
      vinChassisNumber, engineNumber, serviceIntervalKm, serviceIntervalMonths,
      color, fuelType, notes
    } = req.body;

    if (!nickname || !type) {
      return res.status(400).json({ error: 'Nickname and type are required.' });
    }

    const vehicleBookPath = req.file ? req.file.path.replace(/\\/g, '/') : null;
    const vehicleBookOriginalName = req.file ? req.file.originalname : null;

    const result = await pool.query(
      `INSERT INTO vehicles 
        (user_id, nickname, type, make, model, year, registration_number, 
         vin_chassis_number, engine_number, service_interval_km, service_interval_months,
         vehicle_book_path, vehicle_book_original_name, color, fuel_type, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        req.user.id, nickname, type, make || null, model || null,
        year ? parseInt(year) : null, registrationNumber || null,
        vinChassisNumber || null, engineNumber || null,
        serviceIntervalKm ? parseInt(serviceIntervalKm) : 5000,
        serviceIntervalMonths ? parseInt(serviceIntervalMonths) : 6,
        vehicleBookPath, vehicleBookOriginalName,
        color || null, fuelType || null, notes || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create vehicle error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT /api/vehicles/:id - update vehicle
router.put('/:id', verifyToken, upload.single('vehicleBook'), async (req, res) => {
  try {
    // Check ownership
    const existing = await pool.query(
      'SELECT * FROM vehicles WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found.' });
    }

    const {
      nickname, type, make, model, year, registrationNumber,
      vinChassisNumber, engineNumber, serviceIntervalKm, serviceIntervalMonths,
      color, fuelType, notes
    } = req.body;

    let vehicleBookPath = existing.rows[0].vehicle_book_path;
    let vehicleBookOriginalName = existing.rows[0].vehicle_book_original_name;

    if (req.file) {
      // Delete old file if exists
      if (vehicleBookPath && fs.existsSync(vehicleBookPath)) {
        fs.unlinkSync(vehicleBookPath);
      }
      vehicleBookPath = req.file.path.replace(/\\/g, '/');
      vehicleBookOriginalName = req.file.originalname;
    }

    const result = await pool.query(
      `UPDATE vehicles SET
        nickname = $1, type = $2, make = $3, model = $4, year = $5,
        registration_number = $6, vin_chassis_number = $7, engine_number = $8,
        service_interval_km = $9, service_interval_months = $10, vehicle_book_path = $11, vehicle_book_original_name = $12,
        color = $13, fuel_type = $14, notes = $15, updated_at = NOW()
       WHERE id = $16 AND user_id = $17
       RETURNING *`,
      [
        nickname, type, make || null, model || null, year ? parseInt(year) : null,
        registrationNumber || null, vinChassisNumber || null, engineNumber || null,
        serviceIntervalKm ? parseInt(serviceIntervalKm) : 5000,
        serviceIntervalMonths ? parseInt(serviceIntervalMonths) : 6,
        vehicleBookPath, vehicleBookOriginalName,
        color || null, fuelType || null, notes || null,
        req.params.id, req.user.id
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update vehicle error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /api/vehicles/:id
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const existing = await pool.query(
      'SELECT * FROM vehicles WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found.' });
    }

    // Delete vehicle book file
    const vehicle = existing.rows[0];
    if (vehicle.vehicle_book_path && fs.existsSync(vehicle.vehicle_book_path)) {
      fs.unlinkSync(vehicle.vehicle_book_path);
    }

    // Delete associated service attachment files
    const attachments = await pool.query(
      `SELECT sa.file_path FROM service_attachments sa
       JOIN service_records sr ON sa.record_id = sr.id
       WHERE sr.vehicle_id = $1`,
      [req.params.id]
    );
    attachments.rows.forEach(att => {
      if (att.file_path && fs.existsSync(att.file_path)) {
        fs.unlinkSync(att.file_path);
      }
    });

    await pool.query('DELETE FROM vehicles WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ message: 'Vehicle deleted successfully.' });
  } catch (err) {
    console.error('Delete vehicle error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
