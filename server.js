const express = require('express');
const path = require('path');
const db = require('./database.js');
const bcrypt = require('bcrypt');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
require('dotenv').config();

const saltRounds = 10;
const app = express();
const port = 3000;

if (!process.env.SESSION_SECRET) {
    console.warn("Warning: SESSION_SECRET is not set in .env file. Using a default, insecure secret. Please set a secret in a .env file for production.");
}
const a_secret = process.env.SESSION_SECRET || 'your-insecure-default-secret';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '/')));

// --- Session Setup ---
app.use(session({
  store: new SQLiteStore({
    db: 'invoicer.db',
    dir: './'
  }),
  secret: a_secret,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 1 week
}));

// --- Middleware to check if user is authenticated ---
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.redirect('/login.html');
  }
};

// --- ROUTES ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/dashboard', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));

// --- API ENDPOINTS ---

// GET current user's email
app.get('/api/user/me', isAuthenticated, (req, res) => {
    const userId = req.session.userId;
    const sql = `SELECT email FROM users WHERE id = ?`;
    db.get(sql, [userId], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(row);
    });
});

// GET invoice data
app.get('/api/invoices', isAuthenticated, (req, res) => {
    const userId = req.session.userId;
    const sql = `
        SELECT 
            i.id as invoice_id, i.invoice_number, i.contractor_name, i.notes, 
            ii.client, ii.date, ii.description, ii.hours, ii.hourly_rate, ii.total 
        FROM invoices i
        LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
        WHERE i.user_id = ?
    `;
    db.all(sql, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// POST invoice data
app.post('/api/invoices', isAuthenticated, (req, res) => {
    const userId = req.session.userId;
    const { invoiceNumber, contractorName, notes, items } = req.body;
    db.serialize(() => {
        const deleteItemsSql = `DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE user_id = ?)`;
        db.run(deleteItemsSql, [userId]);
        const deleteInvoiceSql = `DELETE FROM invoices WHERE user_id = ?`;
        db.run(deleteInvoiceSql, [userId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            const insertInvoiceSql = `INSERT INTO invoices (user_id, invoice_number, contractor_name, notes) VALUES (?, ?, ?, ?)`;
            db.run(insertInvoiceSql, [userId, invoiceNumber, contractorName, notes], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                const invoiceId = this.lastID;
                if (items && items.length > 0) {
                    const insertItemSql = `INSERT INTO invoice_items (invoice_id, client, date, description, hours, hourly_rate, total) VALUES (?, ?, ?, ?, ?, ?, ?)`;
                    items.forEach(item => {
                        db.run(insertItemSql, [invoiceId, item.client, item.date, item.description, item.hours, item.hourlyRate, item.total]);
                    });
                }
                res.status(201).json({ message: 'Invoice saved successfully!', invoiceId: invoiceId });
            });
        });
    });
});

// --- AUTH ENDPOINTS ---
app.post('/signup', (req, res) => {
  const { email, password } = req.body;
  bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) return res.status(500).json({ error: 'Error hashing password' });
    const sql = `INSERT INTO users (email, password_hash) VALUES (?, ?)`;
    db.run(sql, [email, hash], function(err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(409).json({ error: 'Email already exists.' });
        }
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ message: 'User created successfully!' });
    });
  });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const sql = `SELECT * FROM users WHERE email = ?`;
    db.get(sql, [email], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

        bcrypt.compare(password, user.password_hash, (err, isMatch) => {
            if (err) return res.status(500).json({ error: 'Error comparing passwords' });
            if (isMatch) {
                req.session.userId = user.id;
                res.status(200).json({ message: 'Login successful!' });
            } else {
                res.status(401).json({ error: 'Invalid email or password.' });
            }
        });
    });
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Could not log out.' });
        }
        res.clearCookie('connect.sid');
        res.status(200).json({ message: 'Logout successful.' });
    });
});

app.listen(port, () => {
  console.log(`Server is listening at http://localhost:${port}`);
});