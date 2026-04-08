require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { initDb } = require('./db');
const { requireAuth } = require('./middleware/auth');

const app = express();

// Trust proxy (Vercel / reverse proxies)
app.set('trust proxy', 1);

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ─── Public routes ───
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

// ─── Local dev: start HTTP server ───
// On Vercel this file is imported as a serverless function (no listen).
if (process.env.NODE_ENV !== 'production' || process.env.LOCAL_SERVER === 'true') {
  const PORT = process.env.PORT || 3000;
  initDb()
    .then(() => {
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n🚌 QR Check-In running at http://localhost:${PORT}`);
        console.log(`🔐 Login: ${process.env.ADMIN_USERNAME || 'ADMIN'} / ${process.env.ADMIN_PASSWORD || 'ADMIN123'}`);
        console.log(`📊 Database: PostgreSQL (Supabase)\n`);
      });
    })
    .catch(err => {
      console.error('Failed to initialize database:', err);
      process.exit(1);
    });
} else {
  // On Vercel: initialize DB lazily on first request
  let dbReady = false;
  app.use(async (req, res, next) => {
    if (!dbReady) {
      try {
        await initDb();
        dbReady = true;
      } catch (err) {
        console.error('DB init error:', err);
        return res.status(500).json({ error: 'Database initialization failed' });
      }
    }
    next();
  });
}

module.exports = app;
