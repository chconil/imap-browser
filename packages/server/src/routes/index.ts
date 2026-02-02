import type { FastifyInstance } from 'fastify';
import { registerAuthRoutes } from './auth.js';
import { registerAccountRoutes } from './accounts.js';
import { registerEmailRoutes } from './emails.js';
import { registerComposeRoutes } from './compose.js';
import { registerSettingsRoutes } from './settings.js';

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  await registerAuthRoutes(fastify);
  await registerAccountRoutes(fastify);
  await registerEmailRoutes(fastify);
  await registerComposeRoutes(fastify);
  await registerSettingsRoutes(fastify);

  // Health check endpoint
  fastify.get('/api/health', async () => {
    return {
      status: 'healthy',
      version: process.env.npm_package_version || '0.1.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      services: {
        database: 'up',
        imap: 'up',
      },
    };
  });
}
