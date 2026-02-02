import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';
import { initDatabase, closeDatabase } from './db/index.js';
import { registerRoutes } from './routes/index.js';
import { registerWebSocketRoutes } from './websocket/handler.js';
import { imapConnectionPool } from './services/imap/connection-pool.js';
import { smtpService } from './services/smtp/smtp-service.js';
import { credentialCache } from './services/auth/encryption-service.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const isDev = process.env.NODE_ENV !== 'production';

async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: isDev ? 'debug' : 'info',
      transport: isDev ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      } : undefined,
    },
  });

  // Register plugins
  await fastify.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET || 'change-me-in-production-to-a-random-32-char-string',
    parseOptions: {},
  });

  await fastify.register(fastifyCors, {
    origin: isDev ? true : (process.env.CORS_ORIGIN || 'http://localhost:5173'),
    credentials: true,
  });

  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: isDev ? false : {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
      },
    },
  });

  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB
    },
  });

  await fastify.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await fastify.register(fastifyWebsocket);

  // Initialize database
  initDatabase();
  fastify.log.info('Database initialized');

  // Register routes
  await registerRoutes(fastify);
  await registerWebSocketRoutes(fastify);

  // Graceful shutdown
  const shutdown = async () => {
    fastify.log.info('Shutting down...');

    await imapConnectionPool.stop();
    smtpService.closeAll();
    credentialCache.stop();
    closeDatabase();

    await fastify.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return fastify;
}

async function start() {
  try {
    const server = await buildServer();

    await server.listen({ port: PORT, host: HOST });

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    IMAP Browser Server                    ║
╠═══════════════════════════════════════════════════════════╣
║  Server running at http://${HOST}:${PORT}                      ║
║  API docs at http://${HOST}:${PORT}/api/health                 ║
║  Environment: ${isDev ? 'development' : 'production'}                             ║
╚═══════════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

export { buildServer };
