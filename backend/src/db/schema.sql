-- ServiceTrack Database Schema
-- Run this file to initialize the database

-- Create database (run separately as superuser if needed)
-- CREATE DATABASE servicetrack;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Vehicles table (master data)
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('car', 'bike')),
  make VARCHAR(100),
  model VARCHAR(100),
  year INTEGER,
  registration_number VARCHAR(50),
  vin_chassis_number VARCHAR(100),
  engine_number VARCHAR(100),
  service_interval_km INTEGER DEFAULT 5000,
  service_interval_months INTEGER DEFAULT 6,
  vehicle_book_path VARCHAR(500),
  vehicle_book_original_name VARCHAR(255),
  color VARCHAR(50),
  fuel_type VARCHAR(30),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Service records table
CREATE TABLE IF NOT EXISTS service_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  odometer_reading INTEGER NOT NULL,
  service_center VARCHAR(200),
  total_cost DECIMAL(10, 2) DEFAULT 0,
  notes TEXT,
  next_service_km INTEGER,
  next_service_date DATE,
  service_type VARCHAR(50) DEFAULT 'service',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Service items (work done) table - many per record
CREATE TABLE IF NOT EXISTS service_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES service_records(id) ON DELETE CASCADE,
  description VARCHAR(500) NOT NULL,
  cost DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Service record attachments
CREATE TABLE IF NOT EXISTS service_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES service_records(id) ON DELETE CASCADE,
  file_path VARCHAR(500) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(100),
  file_size INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Service alert logs (for Telegram alert deduplication)
CREATE TABLE IF NOT EXISTS service_alert_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  alert_type VARCHAR(20) NOT NULL,
  alert_date DATE NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vehicle_id, alert_type, alert_date)
);

-- Reminders table
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  reminder_type VARCHAR(50) NOT NULL,
  custom_name VARCHAR(100),
  interval_km INTEGER,
  interval_months INTEGER,
  last_done_km INTEGER,
  last_done_date DATE,
  due_km INTEGER,
  due_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Reminder alert logs (for Telegram reminder alert deduplication)
CREATE TABLE IF NOT EXISTS reminder_alert_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id UUID NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  alert_type VARCHAR(20) NOT NULL,
  alert_date DATE NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(reminder_id, alert_type, alert_date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_vehicles_user_id ON vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_service_records_vehicle_id ON service_records(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_service_records_date ON service_records(service_date);
CREATE INDEX IF NOT EXISTS idx_service_items_record_id ON service_items(record_id);
CREATE INDEX IF NOT EXISTS idx_service_attachments_record_id ON service_attachments(record_id);
CREATE INDEX IF NOT EXISTS idx_reminders_vehicle_id ON reminders(vehicle_id);

-- Seed admin user (password: admin123)
-- bcrypt hash of 'admin123' with 10 rounds
INSERT INTO users (username, password_hash, full_name)
VALUES ('admin', '$2b$10$yw21cTDV77UsTEx/6GqJfO9uJYT/6ayGKrk3mURLwXqPdDeuBWSOu', 'Admin User')
ON CONFLICT (username) DO NOTHING;
