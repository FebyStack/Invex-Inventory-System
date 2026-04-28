const app = require('./src/app');
const config = require('./src/config/env');

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
});
