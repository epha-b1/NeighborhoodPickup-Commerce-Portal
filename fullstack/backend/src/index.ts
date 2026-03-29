import { createApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';

const app = createApp();

app.listen(env.port, () => {
  logger.info('server.started', `Backend listening on http://localhost:${env.port}`, {
    port: env.port,
    nodeEnv: env.nodeEnv,
  });
});