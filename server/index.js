require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { setupWebSocket } = require('./websocket');
const { initDb } = require('./db');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/trips', require('./routes/trips'));
app.use('/api/checkin', require('./routes/checkin'));
app.use('/api/qrcodes', require('./routes/qrcodes'));
app.use('/api/travelers', require('./routes/travelers'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve React build in production
const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientBuildPath));

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    const indexPath = path.join(clientBuildPath, 'index.html');
    if (require('fs').existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: 'Frontend not built. Run: cd client && npm run build' });
    }
  }
});

// WebSocket server
const wss = new WebSocketServer({ server });
setupWebSocket(wss);

// Initialize database then start server
initDb().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║     🚌 QR Check-In Server                      ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  Port:     ${PORT}                                  ║`);
    console.log(`║  Env:      ${(process.env.NODE_ENV || 'development').padEnd(37)}║`);
    console.log('║  API:      /api/*                                ║');
    console.log('║  WS:       same port                             ║');
    console.log('║  Health:   /api/health                           ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
