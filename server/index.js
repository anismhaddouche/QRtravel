require('dotenv').config();
const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { WebSocketServer } = require('ws');
const { setupWebSocket } = require('./websocket');
const { initDb } = require('./db');
const { requireAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Trust proxy (Render runs behind a reverse proxy)
app.set('trust proxy', 1);

// ─── Public routes (no auth required) ───
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.use('/api/auth', require('./routes/auth'));

// ─── Protected routes (auth required) ───
app.use('/api/trips', requireAuth, require('./routes/trips'));
app.use('/api/checkin', requireAuth, require('./routes/checkin'));
app.use('/api/qrcodes', requireAuth, require('./routes/qrcodes'));
app.use('/api/travelers', requireAuth, require('./routes/travelers'));

// Serve React build in production
const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientBuildPath));

// SPA fallback
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    const indexPath = path.join(clientBuildPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: 'Frontend not built. Run: npm run build' });
    }
  }
});

// Create HTTP server
const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer });
setupWebSocket(wss);

// Optional HTTPS server for LAN camera access (local dev only)
let httpsServer = null;
const certPath = path.join(__dirname, 'certs', 'cert.pem');
const keyPath = path.join(__dirname, 'certs', 'key.pem');
const enableHttps = process.env.ENABLE_HTTPS === 'true' || process.argv.includes('--https');

if (enableHttps && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const sslOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
  httpsServer = https.createServer(sslOptions, app);
  const wssSecure = new WebSocketServer({ server: httpsServer });
  setupWebSocket(wssSecure);
}

// Get local network IPs for display
function getNetworkIPs() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

// Start servers
initDb().then(() => {
  httpServer.listen(PORT, '0.0.0.0', () => {
    const ips = getNetworkIPs();
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║     🚌 QR Check-In Server                      ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  HTTP:     http://localhost:${PORT}`.padEnd(51) + '║');
    if (ips.length > 0) {
      console.log(`║  LAN:      http://${ips[0]}:${PORT}`.padEnd(51) + '║');
    }

    if (httpsServer) {
      httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log('║                                                  ║');
        console.log(`║  HTTPS:    https://localhost:${HTTPS_PORT}`.padEnd(51) + '║');
        if (ips.length > 0) {
          console.log(`║  LAN(📱):  https://${ips[0]}:${HTTPS_PORT}`.padEnd(51) + '║');
        }
        console.log('║                                                  ║');
        console.log('║  📱 Use the HTTPS LAN address for iPhone/iPad    ║');
        console.log('║     camera scanning over Wi-Fi.                  ║');
        console.log('╚══════════════════════════════════════════════════╝');
        console.log('');
      });
    } else {
      if (enableHttps) {
        console.log('║                                                  ║');
        console.log('║  ⚠️  HTTPS requested but certs not found.        ║');
        console.log('║  Run: node server/generate-cert.js               ║');
      }
      console.log('╚══════════════════════════════════════════════════╝');
      console.log('');
    }
    console.log('  🔐 Admin login: /api/auth/login');
    console.log(`  📊 Database: PostgreSQL`);
    console.log('');
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
