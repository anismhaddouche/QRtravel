const { v4: uuidv4 } = require('uuid');

// Store connected WebSocket clients
const clients = new Set();

function setupWebSocket(wss) {
  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`📡 WebSocket client connected (${clients.size} total)`);

    // Send a welcome message with connection confirmation
    ws.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`📡 WebSocket client disconnected (${clients.size} total)`);
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err.message);
      clients.delete(ws);
    });

    // Handle incoming messages (for offline queue replay)
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (e) {
        // Ignore malformed messages
      }
    });
  });
}

// Broadcast an event to all connected clients
function broadcast(event) {
  const payload = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(payload);
    }
  }
}

module.exports = { setupWebSocket, broadcast };
