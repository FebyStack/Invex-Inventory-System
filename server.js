const http = require('http');
const app = require('./backend/src/app');
const config = require('./backend/src/config/env');
const notificationService = require('./backend/services/notificationService');
const realtimeService = require('./backend/services/realtimeService');

const PORT = config.port || 3000;

const httpServer = http.createServer(app);
realtimeService.init(httpServer);

/**
 * Start the Invex API Server
 */
httpServer.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║          🚀 INVEX API SERVER             ║
  ║──────────────────────────────────────────║
  ║  Status:  Running                        ║
  ║  Port:    ${String(PORT).padEnd(30)}║
  ║  Mode:    ${String(config.nodeEnv).padEnd(30)}║
  ╚══════════════════════════════════════════╝
  `);

  if (config.notifications.intervalMs > 0) {
    notificationService.start(config.notifications.intervalMs);
  }
});
