const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure upload directories exist (uses /tmp on Vercel which is writable)
const uploadPath = process.env.VERCEL ? '/tmp/uploads' : (process.env.UPLOAD_PATH || 'uploads');
try {
  ['vehicle-books', 'service-attachments'].forEach(dir => {
    const fullPath = path.join(uploadPath, dir);
    if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
  });
} catch (err) {
  console.warn('⚠️  Unable to create upload directories:', err.message);
}

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    // Allow any localhost or 127.0.0.1 origin regardless of port
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:') || origin.startsWith('http://[::1]:')) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.resolve(uploadPath)));

// Routes
app.use(['/api/auth', '/auth'], require('./src/routes/auth'));
app.use(['/api/vehicles', '/vehicles'], require('./src/routes/vehicles'));
app.use(['/api/vehicles/:vehicleId/records', '/vehicles/:vehicleId/records'], require('./src/routes/serviceRecords'));
app.use(['/api/dashboard', '/dashboard'], require('./src/routes/dashboard'));
app.use(['/api/parts', '/parts'], require('./src/routes/parts'));
app.use(['/api/reminders', '/reminders'], require('./src/routes/reminders'));

// Health check
app.get(['/api/health', '/health'], (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Diagnostic check
app.get(['/api/debug-env', '/debug-env'], (req, res) => {
  res.json({
    hasDbUrl: !!process.env.DATABASE_URL,
    hasJwtSecret: !!process.env.JWT_SECRET,
    hasTelegramToken: !!process.env.TELEGRAM_BOT_TOKEN,
    nodeEnv: process.env.NODE_ENV || 'not set',
    envKeysPresent: Object.keys(process.env).filter(k => k.includes('DB') || k.includes('SECRET') || k.includes('TELEGRAM') || k.includes('URL'))
  });
});

// Cron endpoint for Vercel Cron Jobs (daily Telegram notifications trigger)
app.get(['/api/cron/check-alerts', '/cron/check-alerts'], async (req, res) => {
  try {
    const { checkAndSendAlerts } = require('./src/services/alertScheduler');
    await checkAndSendAlerts();
    res.json({ success: true, message: 'Cron alert check complete' });
  } catch (err) {
    console.error('Cron check error:', err);
    res.status(500).json({ error: 'Cron execution failed' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 ServiceTrack API running on http://localhost:${PORT}`);

    // Start local daily cron scheduler
    const { startAlertScheduler } = require('./src/services/alertScheduler');
    startAlertScheduler();
  });
}

module.exports = app;
