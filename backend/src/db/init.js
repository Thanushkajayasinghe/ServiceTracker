const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function initDb() {
  // First connect to default postgres DB to create our DB if needed
  const adminPool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: 'postgres',
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT) || 5432,
  });

  try {
    // Create database if it doesn't exist
    const dbName = process.env.DB_NAME || 'servicetrack';
    const res = await adminPool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (res.rows.length === 0) {
      await adminPool.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Database "${dbName}" created`);
    } else {
      console.log(`ℹ️  Database "${dbName}" already exists`);
    }
  } finally {
    await adminPool.end();
  }

  // Now connect to our database and run schema
  const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT) || 5432,
  });

  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Remove the CREATE DATABASE line since we handle it above
    const schemaWithoutCreate = schema
      .split('\n')
      .filter(line => !line.trim().startsWith('CREATE DATABASE'))
      .join('\n');

    await pool.query(schemaWithoutCreate);
    console.log('✅ Schema applied successfully');

    // Seed admin user properly with bcrypt
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await pool.query(
      `INSERT INTO users (username, password_hash, full_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (username) DO NOTHING`,
      ['admin', hashedPassword, 'Admin User']
    );
    console.log('✅ Admin user seeded (username: admin, password: admin123)');
  } finally {
    await pool.end();
  }
}

initDb()
  .then(() => {
    console.log('\n🚀 Database initialization complete!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Database initialization failed:', err);
    process.exit(1);
  });
