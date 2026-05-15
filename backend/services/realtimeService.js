const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');
const config = require('../src/config/env');

// Heartbeat keeps idle proxies from killing the socket and lets the server
// notice half-open connections (no PONG within the interval => terminate).
const HEARTBEAT_MS = 30_000;

let wss = null;

/**
 * Verify the JWT supplied in the WebSocket upgrade URL.
 * Returns the decoded payload or null if invalid/missing.
 */
function authFromRequest(req) {
  try {
    const { query } = url.parse(req.url, true);
    const raw = query && query.token;
    if (!raw) return null;
    return jwt.verify(raw, config.jwt.secret);
  } catch {
    return null;
  }
}

/**
 * Attach a WebSocket server to the existing HTTP server at path /ws.
 * Clients must connect with a valid JWT in the `?token=` query param.
 */
function init(httpServer) {
  if (wss) return wss;

  wss = new WebSocketServer({ noServer: true });

  // Hook into HTTP upgrade so we can authenticate before completing the
  // WebSocket handshake. Anything other than /ws is left alone.
  httpServer.on('upgrade', (req, socket, head) => {
    const { pathname } = url.parse(req.url);
    if (pathname !== '/ws') return;

    const user = authFromRequest(req);
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.user = { id: user.id, username: user.username, role: user.role };
      ws.isAlive = true;
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'hello', data: { ts: Date.now() } }));

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      // Clients don't need to push anything today; accept and ignore so
      // future features (acks, subscriptions) can land without a protocol bump.
      try { JSON.parse(raw.toString()); } catch { /* ignore */ }
    });
  });

  // Drop dead sockets. Without this, broken connections sit forever.
  const heartbeat = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      try { ws.ping(); } catch { /* ignore */ }
    });
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  wss.on('close', () => clearInterval(heartbeat));

  console.log('[realtime] WebSocket server attached at /ws');
  return wss;
}

/**
 * Broadcast a JSON message to every authed client.
 * No-op if the service hasn't been initialized.
 */
function broadcast(message) {
  if (!wss) return;
  const payload = JSON.stringify(message);
  wss.clients.forEach((ws) => {
    if (ws.readyState !== ws.OPEN) return;
    try { ws.send(payload); } catch { /* ignore */ }
  });
}

/**
 * Number of currently-connected clients. Useful for diagnostics.
 */
function clientCount() {
  return wss ? wss.clients.size : 0;
}

module.exports = { init, broadcast, clientCount };
