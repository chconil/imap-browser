import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createUserSchema, loginSchema, updateUserSchema } from '@imap-browser/shared';
import { authService } from '../services/auth/auth-service.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
};

export async function registerAuthRoutes(fastify: FastifyInstance): Promise<void> {
  // Register
  fastify.post('/api/auth/register', async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = createUserSchema.safeParse(req.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: parseResult.error.flatten(),
        },
      });
    }

    try {
      const result = await authService.register(parseResult.data);

      reply.setCookie('session', result.session.id, COOKIE_OPTIONS);

      return {
        success: true,
        data: {
          user: result.user,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      return reply.status(400).send({
        success: false,
        error: {
          code: 'REGISTRATION_FAILED',
          message,
        },
      });
    }
  });

  // Login
  fastify.post('/api/auth/login', async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = loginSchema.safeParse(req.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: parseResult.error.flatten(),
        },
      });
    }

    try {
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip;

      const result = await authService.login(parseResult.data, userAgent, ipAddress);

      reply.setCookie('session', result.session.id, COOKIE_OPTIONS);

      // Store password hash in session for credential decryption
      // This is stored in a secure, HttpOnly cookie
      reply.setCookie('_auth', Buffer.from(parseResult.data.password).toString('base64'), {
        ...COOKIE_OPTIONS,
        maxAge: 15 * 60, // 15 minutes - shorter for security
      });

      return {
        success: true,
        data: {
          user: result.user,
        },
      };
    } catch (error) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    }
  });

  // Logout
  fastify.post('/api/auth/logout', async (req: FastifyRequest, reply: FastifyReply) => {
    const sessionId = (req.cookies as Record<string, string>)?.session;

    if (sessionId) {
      await authService.logout(sessionId);
    }

    // Clear cookies with matching attributes (required for proper cookie deletion)
    const clearOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
    };

    reply.clearCookie('session', clearOptions);
    reply.clearCookie('_auth', clearOptions);

    return { success: true };
  });

  // Get current user
  fastify.get('/api/auth/me', async (req: FastifyRequest, reply: FastifyReply) => {
    const sessionId = (req.cookies as Record<string, string>)?.session;

    if (!sessionId) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
        },
      });
    }

    const auth = await authService.validateSession(sessionId);

    if (!auth) {
      const clearOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict' as const,
        path: '/',
      };
      reply.clearCookie('session', clearOptions);
      reply.clearCookie('_auth', clearOptions);

      return reply.status(401).send({
        success: false,
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Session expired',
        },
      });
    }

    // Refresh session
    await authService.refreshSession(sessionId);

    return {
      success: true,
      data: {
        user: auth.user,
      },
    };
  });

  // Update user
  fastify.patch('/api/auth/me', async (req: FastifyRequest, reply: FastifyReply) => {
    const sessionId = (req.cookies as Record<string, string>)?.session;

    if (!sessionId) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
        },
      });
    }

    const auth = await authService.validateSession(sessionId);

    if (!auth) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Session expired',
        },
      });
    }

    const parseResult = updateUserSchema.safeParse(req.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: parseResult.error.flatten(),
        },
      });
    }

    try {
      const updatedUser = await authService.updateUser(auth.user.id, parseResult.data);

      return {
        success: true,
        data: {
          user: updatedUser,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Update failed';
      return reply.status(400).send({
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message,
        },
      });
    }
  });

  // Refresh auth cookie (called periodically by client)
  fastify.post('/api/auth/refresh', async (req: FastifyRequest, reply: FastifyReply) => {
    const sessionId = (req.cookies as Record<string, string>)?.session;
    const authCookie = (req.cookies as Record<string, string>)?._auth;

    if (!sessionId) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
        },
      });
    }

    const auth = await authService.validateSession(sessionId);

    if (!auth) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Session expired',
        },
      });
    }

    // Refresh session
    await authService.refreshSession(sessionId);

    // Refresh auth cookie if it exists
    if (authCookie) {
      reply.setCookie('_auth', authCookie, {
        ...COOKIE_OPTIONS,
        maxAge: 15 * 60,
      });
    }

    return { success: true };
  });
}
