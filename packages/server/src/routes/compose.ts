import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { composeEmailSchema, saveDraftSchema } from '@imap-browser/shared';
import { authService } from '../services/auth/auth-service.js';
import { smtpService } from '../services/smtp/smtp-service.js';
import { getDatabase, drafts, draftAttachments } from '../db/index.js';

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

export async function registerComposeRoutes(fastify: FastifyInstance): Promise<void> {
  // Send email
  fastify.post('/api/send', async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await getAuthContext(req, reply);
    if (!ctx) return;

    const parseResult = composeEmailSchema.safeParse(req.body);
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

    const result = await smtpService.sendEmail(
      ctx.userId,
      parseResult.data,
      ctx.userPassword,
      ctx.userSalt,
    );

    if (result.success) {
      return {
        success: true,
        data: { messageId: result.messageId },
      };
    } else {
      return reply.status(400).send({
        success: false,
        error: { code: 'SEND_FAILED', message: result.error },
      });
    }
  });

  // Save draft
  fastify.post('/api/drafts', async (req: FastifyRequest, reply: FastifyReply) => {
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

    const parseResult = saveDraftSchema.safeParse(req.body);
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

    const db = getDatabase();
    const now = new Date().toISOString();
    const data = parseResult.data;

    if (data.id) {
      // Update existing draft
      await db.update(drafts)
        .set({
          toJson: JSON.stringify(data.to),
          ccJson: JSON.stringify(data.cc),
          bccJson: JSON.stringify(data.bcc),
          subject: data.subject,
          textBody: data.textBody,
          htmlBody: data.htmlBody,
          inReplyTo: data.inReplyTo || null,
          referencesJson: JSON.stringify(data.references),
          attachmentIdsJson: JSON.stringify(data.attachmentIds),
          updatedAt: now,
        })
        .where(and(
          eq(drafts.id, data.id),
          eq(drafts.userId, auth.user.id),
        ));

      return {
        success: true,
        data: { draftId: data.id },
      };
    } else {
      // Create new draft
      const draftId = uuidv4();

      await db.insert(drafts).values({
        id: draftId,
        accountId: data.accountId,
        userId: auth.user.id,
        toJson: JSON.stringify(data.to),
        ccJson: JSON.stringify(data.cc),
        bccJson: JSON.stringify(data.bcc),
        subject: data.subject,
        textBody: data.textBody,
        htmlBody: data.htmlBody,
        inReplyTo: data.inReplyTo || null,
        referencesJson: JSON.stringify(data.references),
        attachmentIdsJson: JSON.stringify(data.attachmentIds),
        createdAt: now,
        updatedAt: now,
      });

      return reply.status(201).send({
        success: true,
        data: { draftId },
      });
    }
  });

  // Get drafts
  fastify.get('/api/drafts', async (req: FastifyRequest, reply: FastifyReply) => {
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

    const db = getDatabase();
    const rows = await db.query.drafts.findMany({
      where: eq(drafts.userId, auth.user.id),
    });

    const draftList = rows.map(draft => ({
      id: draft.id,
      accountId: draft.accountId,
      userId: draft.userId,
      to: JSON.parse(draft.toJson),
      cc: JSON.parse(draft.ccJson),
      bcc: JSON.parse(draft.bccJson),
      subject: draft.subject,
      textBody: draft.textBody,
      htmlBody: draft.htmlBody,
      inReplyTo: draft.inReplyTo,
      references: JSON.parse(draft.referencesJson || '[]'),
      attachmentIds: JSON.parse(draft.attachmentIdsJson),
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
    }));

    return {
      success: true,
      data: { drafts: draftList },
    };
  });

  // Get single draft
  fastify.get('/api/drafts/:draftId', async (req: FastifyRequest<{
    Params: { draftId: string };
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

    const db = getDatabase();
    const draft = await db.query.drafts.findFirst({
      where: and(
        eq(drafts.id, req.params.draftId),
        eq(drafts.userId, auth.user.id),
      ),
    });

    if (!draft) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Draft not found' },
      });
    }

    return {
      success: true,
      data: {
        draft: {
          id: draft.id,
          accountId: draft.accountId,
          userId: draft.userId,
          to: JSON.parse(draft.toJson),
          cc: JSON.parse(draft.ccJson),
          bcc: JSON.parse(draft.bccJson),
          subject: draft.subject,
          textBody: draft.textBody,
          htmlBody: draft.htmlBody,
          inReplyTo: draft.inReplyTo,
          references: JSON.parse(draft.referencesJson || '[]'),
          attachmentIds: JSON.parse(draft.attachmentIdsJson),
          createdAt: draft.createdAt,
          updatedAt: draft.updatedAt,
        },
      },
    };
  });

  // Delete draft
  fastify.delete('/api/drafts/:draftId', async (req: FastifyRequest<{
    Params: { draftId: string };
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

    const db = getDatabase();
    await db.delete(drafts).where(and(
      eq(drafts.id, req.params.draftId),
      eq(drafts.userId, auth.user.id),
    ));

    return { success: true };
  });

  // Upload attachment for draft
  fastify.post('/api/attachments', async (req: FastifyRequest, reply: FastifyReply) => {
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

    const data = await req.file();
    if (!data) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NO_FILE', message: 'No file uploaded' },
      });
    }

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    // Check file size (max 25MB)
    if (fileBuffer.length > 25 * 1024 * 1024) {
      return reply.status(400).send({
        success: false,
        error: { code: 'FILE_TOO_LARGE', message: 'File exceeds 25MB limit' },
      });
    }

    const db = getDatabase();
    const attachmentId = uuidv4();

    await db.insert(draftAttachments).values({
      id: attachmentId,
      userId: auth.user.id,
      filename: data.filename,
      contentType: data.mimetype,
      size: fileBuffer.length,
      data: fileBuffer,
      createdAt: new Date().toISOString(),
    });

    return reply.status(201).send({
      success: true,
      data: {
        id: attachmentId,
        filename: data.filename,
        contentType: data.mimetype,
        size: fileBuffer.length,
      },
    });
  });

  // Delete uploaded attachment
  fastify.delete('/api/attachments/:attachmentId', async (req: FastifyRequest<{
    Params: { attachmentId: string };
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

    const db = getDatabase();
    await db.delete(draftAttachments).where(and(
      eq(draftAttachments.id, req.params.attachmentId),
      eq(draftAttachments.userId, auth.user.id),
    ));

    return { success: true };
  });
}
