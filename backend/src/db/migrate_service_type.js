const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'servicetrack',
  port: process.env.DB_PORT || 5432,
});

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE service_records
      ADD COLUMN IF NOT EXISTS service_type VARCHAR(50) DEFAULT 'service'
    `);
    console.log('✅ Added service_type column');

    // Add check constraint only if it doesn't exist yet
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'service_records_service_type_check'
        ) THEN
          ALTER TABLE service_records
          ADD CONSTRAINT service_records_service_type_check
          CHECK (service_type IN ('service', 'wheel_alignment', 'spare_parts'));
        END IF;
      END$$;
    `);
    console.log('✅ Added service_type check constraint');

    // Update any existing NULL values to default
    await pool.query(`UPDATE service_records SET service_type = 'service' WHERE service_type IS NULL`);
    console.log('✅ Backfilled existing records');

    console.log('Migration complete.');
  } catch (err) {
    console.error('Migration error:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
