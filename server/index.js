require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { initDb, checkConnection } = require('./db');
const { requireAuth } = require('./middleware/auth');

const app = express();

// Trust proxy (Vercel / reverse proxies)
app.set('trust proxy', 1);

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ─── Public routes ───
app.get('/api/health', async (req, res) => {
  const dbOk = await checkConnection();
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    database: dbOk ? 'connected' : 'error'
  });
});
app.use('/api/auth', require('./routes/auth'));

// ─── Protected routes ───
app.use('/api/trips',     requireAuth, require('./routes/trips'));
app.use('/api/checkin',   requireAuth, require('./routes/checkin'));
app.use('/api/qrcodes',   requireAuth, require('./routes/qrcodes'));
app.use('/api/travelers', requireAuth, require('./routes/travelers'));

// ─── Serve built React frontend (local dev / traditional hosting) ───
const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientBuildPath, 'index.html'));
    }
  });
}

// ─── Vercel / Serverless Initialization ───
let dbInitialized = false;
let dbInitPromise = null;

// Middleware to lazily initialize the database schema on the first API request
app.use('/api', async (req, res, next) => {
  if (dbInitialized) return next();
  
  if (!dbInitPromise) {
    dbInitPromise = initDb()
      .then(() => {
        dbInitialized = true;
      })
      .catch((err) => {
        console.error('[SERVER] Database initialization failed:', err.message);
        dbInitPromise = null; // allow retrying
        throw err;
      });
  }

  try {
    await dbInitPromise;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Database is starting up or temporarily unavailable', details: err.message });
  }
});

// ─── Local dev: start HTTP server ───
if (process.env.NODE_ENV !== 'production' || process.env.LOCAL_SERVER === 'true') {
  const PORT = process.env.PORT || 3000;
  
  // We trigger initialization explicitly for local dev
  initDb()
    .then(() => {
      dbInitialized = true;
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n🚌 QR Check-In running at http://localhost:${PORT}`);
        console.log(`🔐 Login: ${process.env.ADMIN_USERNAME || 'ADMIN'} / ${process.env.ADMIN_PASSWORD || 'ADMIN123'}`);
        console.log(`📊 Database: PostgreSQL\n`);
      });
    })
    .catch(err => {
      console.error('Failed to initialize database on startup:', err);
      process.exit(1);
    });
}

module.exports = app;
