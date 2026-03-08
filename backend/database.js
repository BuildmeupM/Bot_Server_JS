const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'docsort.db');
let db;

function openConnection() {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const conn = new Database(DB_PATH, { timeout: 30000 });
      conn.pragma('journal_mode = MEMORY');
      conn.pragma('synchronous = OFF');
      conn.pragma('busy_timeout = 30000');
      conn.pragma('cache_size = -32000');
      return conn;
    } catch (err) {
      console.error(`⚠️ SQLite open attempt ${attempt}/${maxRetries} failed:`, err.message);
      if (attempt === maxRetries) throw err;
      const waitMs = 500 * attempt;
      const start = Date.now();
      while (Date.now() - start < waitMs) { /* busy wait */ }
    }
  }
}

function isConnectionHealthy(conn) {
  try {
    conn.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}

function getDB() {
  if (db && isConnectionHealthy(db)) {
    return db;
  }

  // Connection is stale or doesn't exist — reconnect
  if (db) {
    console.warn('⚠️ SQLite connection stale, reconnecting...');
    try { db.close(); } catch { /* ignore close errors */ }
    db = null;
  }

  db = openConnection();
  console.log('✅ SQLite connection (re)established');
  return db;
}

function initDB() {
  const database = getDB();

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      display_name TEXT,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      file_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Company Master Data — auto-populated from OCR results
  database.exec(`
    CREATE TABLE IF NOT EXISTS companies_master (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tax_id TEXT UNIQUE NOT NULL,
      name_th TEXT,
      name_en TEXT,
      address TEXT,
      tax_id_valid INTEGER DEFAULT 0,
      verified INTEGER DEFAULT 0,
      source TEXT DEFAULT 'ocr',
      times_seen INTEGER DEFAULT 1,
      first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_companies_tax_id ON companies_master(tax_id)`);

  // Bot Database Data
  database.exec(`
    CREATE TABLE IF NOT EXISTS bot_credentials (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS bot_profiles (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      software TEXT NOT NULL,
      peak_code TEXT,
      status TEXT DEFAULT 'idle',
      last_sync TEXT DEFAULT 'ไม่เคยทำงาน',
      vat_status TEXT DEFAULT 'registered',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS bot_pdf_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL,
      company_name TEXT,
      customer_code TEXT,
      account_code TEXT,
      payment_code TEXT,
      FOREIGN KEY (profile_id) REFERENCES bot_profiles(id) ON DELETE CASCADE
    )
  `);

  // Seed default admin user
  const adminExists = database.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    database.prepare(
      'INSERT INTO users (username, password, display_name, role) VALUES (?, ?, ?, ?)'
    ).run('admin', hashedPassword, 'Admin User', 'admin');
    console.log('✅ Default admin user created (admin / admin123)');
  }
}

function logActivity(userId, action, details, filePath) {
  const database = getDB();
  database.prepare(
    'INSERT INTO activity_log (user_id, action, details, file_path) VALUES (?, ?, ?, ?)'
  ).run(userId, action, details, filePath);
}

module.exports = { getDB, initDB, logActivity };
