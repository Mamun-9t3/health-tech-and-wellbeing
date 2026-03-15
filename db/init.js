require('dotenv').config();
const pool = require('./database');

async function initDB() {
  const client = await pool.connect();
  try {
    console.log('Connected to Neon. Creating tables...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id        SERIAL PRIMARY KEY,
        username  VARCHAR(100) UNIQUE NOT NULL,
        email     VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
        session_id VARCHAR(100),
        role       VARCHAR(10) NOT NULL CHECK (role IN ('user','assistant')),
        message    TEXT NOT NULL,
        is_emergency BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS wellness_logs (
        id               SERIAL PRIMARY KEY,
        user_id          INTEGER REFERENCES users(id) ON DELETE CASCADE,
        duration_seconds INTEGER NOT NULL,
        completed        BOOLEAN DEFAULT TRUE,
        created_at       TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS symptom_logs (
        id             SERIAL PRIMARY KEY,
        user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
        symptom_input  TEXT NOT NULL,
        recommendation TEXT NOT NULL,
        created_at     TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS dashboard_state (
        user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        wellness    INTEGER DEFAULT 12,
        hydration   INTEGER DEFAULT 0,
        active_mins INTEGER DEFAULT 0,
        focus_mins  INTEGER DEFAULT 0,
        updated_at  TIMESTAMPTZ DEFAULT NOW(),
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log('✅ All tables created (or already exist).');
  } catch (err) {
    console.error('❌ Error creating tables:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

initDB();
