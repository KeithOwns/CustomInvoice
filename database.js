const sqlite3 = require('sqlite3').verbose();

// Connect to the database file
const db = new sqlite3.Database('./invoicer.db', (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Use serialize to ensure table creation and updates happen in order
db.serialize(() => {
  // Create users table if it doesn't exist
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  )`, (err) => {
    if (err) {
        console.error("Error creating users table", err.message);
        return;
    }
    // After creating the table, check if columns need to be added.
    // We check for one column; if it's missing, we assume all are and add them.
    db.get("SELECT company_name FROM users LIMIT 1", (err) => {
        if (err) { // An error here likely means the column doesn't exist.
            console.log("Schema migration needed: Adding custom user columns.");
            db.serialize(() => {
                db.run(`ALTER TABLE users ADD COLUMN company_name TEXT`, e => { if(e) console.error("Failed to add company_name:", e)});
                db.run(`ALTER TABLE users ADD COLUMN company_address TEXT`, e => { if(e) console.error("Failed to add company_address:", e)});
                db.run(`ALTER TABLE users ADD COLUMN logo_url TEXT`, e => { if(e) console.error("Failed to add logo_url:", e)});
            });
        }
    });
  });

  // Create invoices table
  db.run(`CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    invoice_number TEXT,
    contractor_name TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`, (err) => {
    if (err) console.error("Error creating invoices table", err.message);
  });

  // Create invoice_items table
  db.run(`CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    client TEXT,
    date TEXT,
    description TEXT,
    hours REAL,
    hourly_rate REAL,
    total REAL,
    FOREIGN KEY (invoice_id) REFERENCES invoices (id)
  )`, (err) => {
    if (err) console.error("Error creating invoice_items table", err.message);
  });
});

module.exports = db;