const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure upload directories exist
const uploadPath = process.env.UPLOAD_PATH || 'uploads';
['vehicle-books', 'service-attachments'].forEach(dir => {
  const fullPath = path.join(uploadPath, dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

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
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/vehicles', require('./src/routes/vehicles'));
app.use('/api/vehicles/:vehicleId/records', require('./src/routes/serviceRecords'));
app.use('/api/dashboard', require('./src/routes/dashboard'));
app.use('/api/parts', require('./src/routes/parts'));
app.use('/api/reminders', require('./src/routes/reminders'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

app.listen(PORT, () => {
  console.log(`🚀 ServiceTrack API running on http://localhost:${PORT}`);

  // Start Telegram service alert scheduler
  const { startAlertScheduler } = require('./src/services/alertScheduler');
  startAlertScheduler();
});

module.exports = app;
