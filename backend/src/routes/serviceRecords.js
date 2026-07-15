const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');
require('dotenv').config();

const router = express.Router({ mergeParams: true });

// Multer setup for service attachments
const attachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.env.UPLOAD_PATH || 'uploads', 'service-attachments');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `attachment-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage: attachmentStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type.'));
    }
  },
});

// Helper: verify vehicle belongs to user
async function verifyVehicleOwnership(vehicleId, userId) {
  const result = await pool.query(
    'SELECT id FROM vehicles WHERE id = $1 AND user_id = $2',
    [vehicleId, userId]
  );
  return result.rows.length > 0;
}

// GET /api/vehicles/:vehicleId/records
router.get('/', verifyToken, async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const { search, year } = req.query;

    const owned = await verifyVehicleOwnership(vehicleId, req.user.id);
    if (!owned) return res.status(404).json({ error: 'Vehicle not found.' });

    let query = `
      SELECT 
        sr.*,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', si.id,
              'description', si.description,
              'cost', si.cost
            )
          ) FILTER (WHERE si.id IS NOT NULL), '[]'
        ) AS service_items,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', sa.id,
              'filePath', sa.file_path,
              'originalName', sa.original_name,
              'fileType', sa.file_type,
              'fileSize', sa.file_size
            )
          ) FILTER (WHERE sa.id IS NOT NULL), '[]'
        ) AS attachments
      FROM service_records sr
      LEFT JOIN service_items si ON si.record_id = sr.id
      LEFT JOIN service_attachments sa ON sa.record_id = sr.id
      WHERE sr.vehicle_id = $1
    `;
    const params = [vehicleId];
    let paramIdx = 2;

    if (search) {
      query += ` AND (sr.service_center ILIKE $${paramIdx} OR sr.notes ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (year) {
      query += ` AND EXTRACT(YEAR FROM sr.service_date) = $${paramIdx}`;
      params.push(parseInt(year));
      paramIdx++;
    }

    query += ' GROUP BY sr.id ORDER BY sr.service_date DESC, sr.odometer_reading DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get records error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/vehicles/:vehicleId/records/:recordId
router.get('/:recordId', verifyToken, async (req, res) => {
  try {
    const { vehicleId, recordId } = req.params;

    const owned = await verifyVehicleOwnership(vehicleId, req.user.id);
    if (!owned) return res.status(404).json({ error: 'Vehicle not found.' });

    const result = await pool.query(
      `SELECT 
        sr.*,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('id', si.id, 'description', si.description, 'cost', si.cost)
          ) FILTER (WHERE si.id IS NOT NULL), '[]'
        ) AS service_items,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', sa.id, 'filePath', sa.file_path,
              'originalName', sa.original_name, 'fileType', sa.file_type
            )
          ) FILTER (WHERE sa.id IS NOT NULL), '[]'
        ) AS attachments
       FROM service_records sr
       LEFT JOIN service_items si ON si.record_id = sr.id
       LEFT JOIN service_attachments sa ON sa.record_id = sr.id
       WHERE sr.id = $1 AND sr.vehicle_id = $2
       GROUP BY sr.id`,
      [recordId, vehicleId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Record not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get record error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/vehicles/:vehicleId/records
router.post('/', verifyToken, upload.array('attachments', 10), async (req, res) => {
  const client = await pool.connect();
  try {
    const { vehicleId } = req.params;
    const owned = await verifyVehicleOwnership(vehicleId, req.user.id);
    if (!owned) return res.status(404).json({ error: 'Vehicle not found.' });

    const {
      serviceDate, odometerReading, serviceCenter,
      totalCost, notes, serviceItems, serviceType
    } = req.body;

    if (!serviceDate || !odometerReading) {
      return res.status(400).json({ error: 'Service date and odometer reading are required.' });
    }

    await client.query('BEGIN');

    // Calculate next service mileage & date ONLY if the type is 'service'
    let computedNextServiceKm = null;
    let computedNextServiceDate = null;
    if ((serviceType || 'service') === 'service') {
      const vehicleRes = await client.query(
        'SELECT service_interval_km, service_interval_months FROM vehicles WHERE id = $1',
        [vehicleId]
      );
      const serviceInterval = (vehicleRes.rows[0] && vehicleRes.rows[0].service_interval_km) || 5000;
      const serviceIntervalMonths = (vehicleRes.rows[0] && vehicleRes.rows[0].service_interval_months) || 6;
      computedNextServiceKm = parseInt(odometerReading) + parseInt(serviceInterval);

      const baseDate = new Date(serviceDate);
      baseDate.setMonth(baseDate.getMonth() + parseInt(serviceIntervalMonths));
      computedNextServiceDate = baseDate.toISOString().split('T')[0];
    }

    // Insert service record
    const recordResult = await client.query(
      `INSERT INTO service_records 
        (vehicle_id, service_date, odometer_reading, service_center, total_cost, notes, next_service_km, next_service_date, service_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        vehicleId, serviceDate, parseInt(odometerReading),
        serviceCenter || null, parseFloat(totalCost) || 0,
        notes || null,
        computedNextServiceKm,
        computedNextServiceDate,
        serviceType || 'service'
      ]
    );

    const record = recordResult.rows[0];

    // Insert service items
    if (serviceItems) {
      const items = JSON.parse(serviceItems);
      for (const item of items) {
        if (item.description && item.description.trim()) {
          await client.query(
            'INSERT INTO service_items (record_id, description, cost) VALUES ($1, $2, $3)',
            [record.id, item.description.trim(), parseFloat(item.cost) || 0]
          );
        }
      }
    }

    // Insert attachments
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await client.query(
          `INSERT INTO service_attachments (record_id, file_path, original_name, file_type, file_size)
           VALUES ($1, $2, $3, $4, $5)`,
          [record.id, file.path.replace(/\\/g, '/'), file.originalname, file.mimetype, file.size]
        );
      }
    }

    await client.query('COMMIT');

    // Fetch complete record with items and attachments
    const fullRecord = await pool.query(
      `SELECT sr.*,
        COALESCE(json_agg(DISTINCT jsonb_build_object('id', si.id, 'description', si.description, 'cost', si.cost)) FILTER (WHERE si.id IS NOT NULL), '[]') AS service_items,
        COALESCE(json_agg(DISTINCT jsonb_build_object('id', sa.id, 'filePath', sa.file_path, 'originalName', sa.original_name)) FILTER (WHERE sa.id IS NOT NULL), '[]') AS attachments
       FROM service_records sr
       LEFT JOIN service_items si ON si.record_id = sr.id
       LEFT JOIN service_attachments sa ON sa.record_id = sr.id
       WHERE sr.id = $1
       GROUP BY sr.id`,
      [record.id]
    );

    res.status(201).json(fullRecord.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create record error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

// PUT /api/vehicles/:vehicleId/records/:recordId
router.put('/:recordId', verifyToken, upload.array('attachments', 10), async (req, res) => {
  const client = await pool.connect();
  try {
    const { vehicleId, recordId } = req.params;

    const owned = await verifyVehicleOwnership(vehicleId, req.user.id);
    if (!owned) return res.status(404).json({ error: 'Vehicle not found.' });

    const existing = await pool.query(
      'SELECT id FROM service_records WHERE id = $1 AND vehicle_id = $2',
      [recordId, vehicleId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Record not found.' });

    const {
      serviceDate, odometerReading, serviceCenter,
      totalCost, notes, serviceItems, deleteAttachmentIds, serviceType
    } = req.body;

    await client.query('BEGIN');

    // Calculate next service mileage & date ONLY if the type is 'service'
    let computedNextServiceKm = null;
    let computedNextServiceDate = null;
    if ((serviceType || 'service') === 'service') {
      const vehicleRes = await client.query(
        'SELECT service_interval_km, service_interval_months FROM vehicles WHERE id = $1',
        [vehicleId]
      );
      const serviceInterval = (vehicleRes.rows[0] && vehicleRes.rows[0].service_interval_km) || 5000;
      const serviceIntervalMonths = (vehicleRes.rows[0] && vehicleRes.rows[0].service_interval_months) || 6;
      computedNextServiceKm = parseInt(odometerReading) + parseInt(serviceInterval);

      const baseDate = new Date(serviceDate);
      baseDate.setMonth(baseDate.getMonth() + parseInt(serviceIntervalMonths));
      computedNextServiceDate = baseDate.toISOString().split('T')[0];
    }

    await client.query(
      `UPDATE service_records SET
        service_date=$1, odometer_reading=$2, service_center=$3,
        total_cost=$4, notes=$5, next_service_km=$6, next_service_date=$7,
        service_type=$8, updated_at=NOW()
       WHERE id=$9`,
      [
        serviceDate, parseInt(odometerReading), serviceCenter || null,
        parseFloat(totalCost) || 0, notes || null,
        computedNextServiceKm,
        computedNextServiceDate,
        serviceType || 'service',
        recordId
      ]
    );

    // Replace service items
    await client.query('DELETE FROM service_items WHERE record_id = $1', [recordId]);
    if (serviceItems) {
      const items = JSON.parse(serviceItems);
      for (const item of items) {
        if (item.description && item.description.trim()) {
          await client.query(
            'INSERT INTO service_items (record_id, description, cost) VALUES ($1, $2, $3)',
            [recordId, item.description.trim(), parseFloat(item.cost) || 0]
          );
        }
      }
    }

    // Delete specific attachments if requested
    if (deleteAttachmentIds) {
      const ids = JSON.parse(deleteAttachmentIds);
      for (const attId of ids) {
        const att = await client.query(
          'SELECT file_path FROM service_attachments WHERE id = $1 AND record_id = $2',
          [attId, recordId]
        );
        if (att.rows.length > 0 && att.rows[0].file_path && fs.existsSync(att.rows[0].file_path)) {
          fs.unlinkSync(att.rows[0].file_path);
        }
        await client.query('DELETE FROM service_attachments WHERE id = $1', [attId]);
      }
    }

    // Add new attachments
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await client.query(
          `INSERT INTO service_attachments (record_id, file_path, original_name, file_type, file_size)
           VALUES ($1, $2, $3, $4, $5)`,
          [recordId, file.path.replace(/\\/g, '/'), file.originalname, file.mimetype, file.size]
        );
      }
    }

    await client.query('COMMIT');

    const fullRecord = await pool.query(
      `SELECT sr.*,
        COALESCE(json_agg(DISTINCT jsonb_build_object('id', si.id, 'description', si.description, 'cost', si.cost)) FILTER (WHERE si.id IS NOT NULL), '[]') AS service_items,
        COALESCE(json_agg(DISTINCT jsonb_build_object('id', sa.id, 'filePath', sa.file_path, 'originalName', sa.original_name)) FILTER (WHERE sa.id IS NOT NULL), '[]') AS attachments
       FROM service_records sr
       LEFT JOIN service_items si ON si.record_id = sr.id
       LEFT JOIN service_attachments sa ON sa.record_id = sr.id
       WHERE sr.id = $1
       GROUP BY sr.id`,
      [recordId]
    );

    res.json(fullRecord.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update record error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

// DELETE /api/vehicles/:vehicleId/records/:recordId
router.delete('/:recordId', verifyToken, async (req, res) => {
  try {
    const { vehicleId, recordId } = req.params;

    const owned = await verifyVehicleOwnership(vehicleId, req.user.id);
    if (!owned) return res.status(404).json({ error: 'Vehicle not found.' });

    // Get attachments to delete files
    const attachments = await pool.query(
      'SELECT file_path FROM service_attachments WHERE record_id = $1',
      [recordId]
    );
    attachments.rows.forEach(att => {
      if (att.file_path && fs.existsSync(att.file_path)) {
        fs.unlinkSync(att.file_path);
      }
    });

    await pool.query(
      'DELETE FROM service_records WHERE id = $1 AND vehicle_id = $2',
      [recordId, vehicleId]
    );

    res.json({ message: 'Service record deleted.' });
  } catch (err) {
    console.error('Delete record error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
