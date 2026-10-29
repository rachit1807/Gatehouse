import { config } from './config.js';
import app from './app.js';
import { closeStore } from './models/store.js';
const server = app.listen(config.port, '0.0.0.0', () => console.log(`Gatehouse listening on port ${config.port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(async () => { await closeStore(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
});
