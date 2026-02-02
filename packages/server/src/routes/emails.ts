import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { emailListQuerySchema, flagUpdateSchema, moveEmailsSchema, deleteEmailsSchema, searchQuerySchema } from '@imap-browser/shared';
import { authService } from '../services/auth/auth-service.js';
import { emailService } from '../services/email/email-service.js';
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

export async function registerEmailRoutes(fastify: FastifyInstance): Promise<void> {
  // List emails in a folder
  fastify.get('/api/accounts/:accountId/folders/:folderId/emails', async (req: FastifyRequest<{
    Params: { accountId: string; folderId: string };
    Querystring: { page?: string; pageSize?: string; search?: string; sortBy?: string; sortOrder?: string };
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

    const query = {
      accountId: req.params.accountId,
      folderId: req.params.folderId,
      page: req.query.page ? parseInt(req.query.page, 10) : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize, 10) : 50,
      search: req.query.search,
      sortBy: req.query.sortBy as 'date' | 'from' | 'subject' | 'size' | undefined,
      sortOrder: req.query.sortOrder as 'asc' | 'desc' | undefined,
    };

    const parseResult = emailListQuerySchema.safeParse(query);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: parseResult.error.flatten(),
        },
      });
    }

    try {
      const result = await emailService.getEmails(auth.user.id, parseResult.data);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get emails';
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message },
      });
    }
  });

  // Get single email
  fastify.get('/api/accounts/:accountId/emails/:emailId', async (req: FastifyRequest<{
    Params: { accountId: string; emailId: string };
  }>, reply: FastifyReply) => {
    const ctx = await getAuthContext(req, reply);
    if (!ctx) return;

    try {
      const email = await emailService.getEmail(
        ctx.userId,
        req.params.accountId,
        req.params.emailId,
        ctx.userPassword,
        ctx.userSalt,
      );

      return {
        success: true,
        data: { email },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get email';
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message },
      });
    }
  });

  // Update email flags
  fastify.post('/api/accounts/:accountId/emails/flags', async (req: FastifyRequest<{
    Params: { accountId: string };
  }>, reply: FastifyReply) => {
    const ctx = await getAuthContext(req, reply);
    if (!ctx) return;

    const parseResult = flagUpdateSchema.safeParse(req.body);
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
      await emailService.updateFlags(
        ctx.userId,
        req.params.accountId,
        parseResult.data,
        ctx.userPassword,
        ctx.userSalt,
      );

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update flags';
      return reply.status(400).send({
        success: false,
        error: { code: 'UPDATE_FAILED', message },
      });
    }
  });

  // Move emails
  fastify.post('/api/accounts/:accountId/emails/move', async (req: FastifyRequest<{
    Params: { accountId: string };
  }>, reply: FastifyReply) => {
    const ctx = await getAuthContext(req, reply);
    if (!ctx) return;

    const parseResult = moveEmailsSchema.safeParse(req.body);
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
      await emailService.moveMessages(
        ctx.userId,
        req.params.accountId,
        parseResult.data,
        ctx.userPassword,
        ctx.userSalt,
      );

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to move emails';
      return reply.status(400).send({
        success: false,
        error: { code: 'MOVE_FAILED', message },
      });
    }
  });

  // Delete emails
  fastify.post('/api/accounts/:accountId/emails/delete', async (req: FastifyRequest<{
    Params: { accountId: string };
  }>, reply: FastifyReply) => {
    const ctx = await getAuthContext(req, reply);
    if (!ctx) return;

    const parseResult = deleteEmailsSchema.safeParse(req.body);
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
      await emailService.deleteMessages(
        ctx.userId,
        req.params.accountId,
        parseResult.data.emailIds,
        parseResult.data.permanent,
        ctx.userPassword,
        ctx.userSalt,
      );

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete emails';
      return reply.status(400).send({
        success: false,
        error: { code: 'DELETE_FAILED', message },
      });
    }
  });

  // Search emails
  fastify.get('/api/emails/search', async (req: FastifyRequest<{
    Querystring: Record<string, string>;
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

    const parseResult = searchQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query',
          details: parseResult.error.flatten(),
        },
      });
    }

    try {
      const emails = await emailService.searchMessages(auth.user.id, parseResult.data);
      return {
        success: true,
        data: { emails },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed';
      return reply.status(400).send({
        success: false,
        error: { code: 'SEARCH_FAILED', message },
      });
    }
  });

  // Sync folder
  fastify.post('/api/accounts/:accountId/folders/:folderId/sync', async (req: FastifyRequest<{
    Params: { accountId: string; folderId: string };
  }>, reply: FastifyReply) => {
    const ctx = await getAuthContext(req, reply);
    if (!ctx) return;

    // Get folder path from folderId
    const { eq, and } = await import('drizzle-orm');
    const { getDatabase, folders, accounts } = await import('../db/index.js');
    const db = getDatabase();

    const account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.id, req.params.accountId),
        eq(accounts.userId, ctx.userId),
      ),
    });

    if (!account) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Account not found' },
      });
    }

    const folder = await db.query.folders.findFirst({
      where: and(
        eq(folders.id, req.params.folderId),
        eq(folders.accountId, req.params.accountId),
      ),
    });

    if (!folder) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Folder not found' },
      });
    }

    try {
      const result = await imapSyncService.syncFolder(
        req.params.accountId,
        folder.path,
        ctx.userPassword,
        ctx.userSalt,
      );

      // Also update counts for all folders in background
      imapSyncService.updateAllFolderCounts(
        req.params.accountId,
        ctx.userPassword,
        ctx.userSalt,
      ).catch(err => console.error('Error updating folder counts:', err));

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      return reply.status(400).send({
        success: false,
        error: { code: 'SYNC_FAILED', message },
      });
    }
  });

  // Download attachment
  fastify.get('/api/accounts/:accountId/attachments/:attachmentId', async (req: FastifyRequest<{
    Params: { accountId: string; attachmentId: string };
  }>, reply: FastifyReply) => {
    const ctx = await getAuthContext(req, reply);
    if (!ctx) return;

    try {
      const { stream, contentType, filename, size } = await emailService.getAttachment(
        ctx.userId,
        req.params.accountId,
        req.params.attachmentId,
        ctx.userPassword,
        ctx.userSalt,
      );

      reply.header('Content-Type', contentType);
      reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      reply.header('Content-Length', size);

      // Stream the attachment
      return reply.send(stream);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to download attachment';
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message },
      });
    }
  });
}
