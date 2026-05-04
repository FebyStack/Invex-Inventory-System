const app = require('./backend/src/app');
const config = require('./backend/src/config/env');
const notificationService = require('./backend/services/notificationService');

const PORT = config.port || 3000;

/**
 * Start the Invex API Server
 */
app.listen(PORT, () => {
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
