import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createAccountSchema, updateAccountSchema } from '@imap-browser/shared';
import { authService } from '../services/auth/auth-service.js';
import { accountService } from '../services/account-service.js';
import { imapSyncService } from '../services/imap/sync-service.js';

// Helper to get authenticated user and password
async function getAuthContext(req: FastifyRequest, reply: FastifyReply): Promise<{
  userId: string;
  userPassword: string;
  userSalt: string;
} | null> {
  const sessionId = (req.cookies as Record<string, string>)?.session;
  const authCookie = (req.cookies as Record<string, string>)?._auth;

  if (!sessionId) {
    reply.status(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
    });
    return null;
  }

  const auth = await authService.validateSession(sessionId);
  if (!auth) {
    reply.status(401).send({
      success: false,
      error: { code: 'SESSION_EXPIRED', message: 'Session expired' },
    });
    return null;
  }

  if (!authCookie) {
    reply.status(401).send({
      success: false,
      error: { code: 'REAUTH_REQUIRED', message: 'Please re-authenticate' },
    });
    return null;
  }

  const userSalt = await authService.getEncryptionSalt(auth.user.id);
  if (!userSalt) {
    reply.status(500).send({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'User configuration error' },
    });
    return null;
  }

  return {
    userId: auth.user.id,
    userPassword: Buffer.from(authCookie, 'base64').toString('utf8'),
    userSalt,
  };
}

export async function registerAccountRoutes(fastify: FastifyInstance): Promise<void> {
  // List accounts
  fastify.get('/api/accounts', async (req: FastifyRequest, reply: FastifyReply) => {
    const sessionId = (req.cookies as Record<string, string>)?.session;

    if (!sessionId) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    const auth = await authService.validateSession(sessionId);
    if (!auth) {
      return reply.status(401).send({
        success: false,
        error: { code: 'SESSION_EXPIRED', message: 'Session expired' },
      });
    }

    const accounts = await accountService.getAccounts(auth.user.id);

    return {
      success: true,
      data: { accounts },
    };
  });

  // Get account
  fastify.get('/api/accounts/:accountId', async (req: FastifyRequest<{
    Params: { accountId: string };
  }>, reply: FastifyReply) => {
    const sessionId = (req.cookies as Record<string, string>)?.session;

    if (!sessionId) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    const auth = await authService.validateSession(sessionId);
    if (!auth) {
      return reply.status(401).send({
        success: false,
        error: { code: 'SESSION_EXPIRED', message: 'Session expired' },
      });
    }

    const account = await accountService.getAccount(auth.user.id, req.params.accountId);

    if (!account) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Account not found' },
      });
    }

    return {
      success: true,
      data: { account },
    };
  });

  // Create account
  fastify.post('/api/accounts', async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await getAuthContext(req, reply);
    if (!ctx) return;

    const parseResult = createAccountSchema.safeParse(req.body);
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
      const account = await accountService.createAccount(
        ctx.userId,
        parseResult.data,
        ctx.userPassword,
        ctx.userSalt,
      );

      return reply.status(201).send({
        success: true,
        data: { account },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create account';
      return reply.status(400).send({
        success: false,
        error: { code: 'CREATE_FAILED', message },
      });
    }
  });

  // Update account
  fastify.patch('/api/accounts/:accountId', async (req: FastifyRequest<{
    Params: { accountId: string };
  }>, reply: FastifyReply) => {
    const ctx = await getAuthContext(req, reply);
    if (!ctx) return;

    const parseResult = updateAccountSchema.safeParse(req.body);
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
      const account = await accountService.updateAccount(
        ctx.userId,
        req.params.accountId,
        parseResult.data,
        ctx.userPassword,
        ctx.userSalt,
      );

      return {
        success: true,
        data: { account },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update account';

      if (message === 'Account not found') {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message },
        });
      }

      return reply.status(400).send({
        success: false,
        error: { code: 'UPDATE_FAILED', message },
      });
    }
  });

  // Delete account
  fastify.delete('/api/accounts/:accountId', async (req: FastifyRequest<{
    Params: { accountId: string };
  }>, reply: FastifyReply) => {
    const sessionId = (req.cookies as Record<string, string>)?.session;

    if (!sessionId) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    const auth = await authService.validateSession(sessionId);
    if (!auth) {
      return reply.status(401).send({
        success: false,
        error: { code: 'SESSION_EXPIRED', message: 'Session expired' },
      });
    }

    try {
      await accountService.deleteAccount(auth.user.id, req.params.accountId);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete account';

      if (message === 'Account not found') {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message },
        });
      }

      return reply.status(400).send({
        success: false,
        error: { code: 'DELETE_FAILED', message },
      });
    }
  });

  // Get folders for account
  fastify.get('/api/accounts/:accountId/folders', async (req: FastifyRequest<{
    Params: { accountId: string };
  }>, reply: FastifyReply) => {
    const sessionId = (req.cookies as Record<string, string>)?.session;

    if (!sessionId) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    const auth = await authService.validateSession(sessionId);
    if (!auth) {
      return reply.status(401).send({
        success: false,
        error: { code: 'SESSION_EXPIRED', message: 'Session expired' },
      });
    }

    try {
      const folders = await accountService.getFolders(auth.user.id, req.params.accountId);
      return {
        success: true,
        data: { folders },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get folders';
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message },
      });
    }
  });

  // Sync account folders
  fastify.post('/api/accounts/:accountId/sync', async (req: FastifyRequest<{
    Params: { accountId: string };
  }>, reply: FastifyReply) => {
    const ctx = await getAuthContext(req, reply);
    if (!ctx) return;

    try {
      await imapSyncService.syncFolders(
        req.params.accountId,
        ctx.userPassword,
        ctx.userSalt,
      );

      const folders = await accountService.getFolders(ctx.userId, req.params.accountId);

      return {
        success: true,
        data: { folders },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      return reply.status(400).send({
        success: false,
        error: { code: 'SYNC_FAILED', message },
      });
    }
  });

  // Test IMAP connection
  fastify.post('/api/accounts/test-connection', async (req: FastifyRequest<{
    Body: {
      imapHost: string;
      imapPort: number;
      imapSecurity: 'tls' | 'starttls' | 'none';
      imapUsername: string;
      imapPassword: string;
    };
  }>, reply: FastifyReply) => {
    const sessionId = (req.cookies as Record<string, string>)?.session;

    if (!sessionId) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    const auth = await authService.validateSession(sessionId);
    if (!auth) {
      return reply.status(401).send({
        success: false,
        error: { code: 'SESSION_EXPIRED', message: 'Session expired' },
      });
    }

    const { imapHost, imapPort, imapSecurity, imapUsername, imapPassword } = req.body as {
      imapHost: string;
      imapPort: number;
      imapSecurity: 'tls' | 'starttls' | 'none';
      imapUsername: string;
      imapPassword: string;
    };

    const result = await accountService.testImapConnection(
      imapHost,
      imapPort,
      imapSecurity,
      imapUsername,
      imapPassword,
    );

    if (result.success) {
      return { success: true };
    } else {
      return reply.status(400).send({
        success: false,
        error: { code: 'CONNECTION_FAILED', message: result.error },
      });
    }
  });

  // Reorder accounts
  fastify.post('/api/accounts/reorder', async (req: FastifyRequest<{
    Body: { accountIds: string[] };
  }>, reply: FastifyReply) => {
    const sessionId = (req.cookies as Record<string, string>)?.session;

    if (!sessionId) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    const auth = await authService.validateSession(sessionId);
    if (!auth) {
      return reply.status(401).send({
        success: false,
        error: { code: 'SESSION_EXPIRED', message: 'Session expired' },
      });
    }

    const { accountIds } = req.body as { accountIds: string[] };

    await accountService.reorderAccounts(auth.user.id, accountIds);

    return { success: true };
  });
}
