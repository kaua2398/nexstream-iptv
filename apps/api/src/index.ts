import { createServer } from 'node:http';
import { env } from './config/env.js';
import { createApp } from './presentation/app.js';
import { logger } from './utils/logger.js';
import { prisma } from './infrastructure/persistence/prisma.js';

const app = createApp();
const server = createServer(app);

server.listen(env.API_PORT, '0.0.0.0', () => {
  logger.info({ port: env.API_PORT }, 'NexStream API started');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
