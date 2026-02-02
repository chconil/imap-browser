import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { updateSettingsSchema } from '@imap-browser/shared';
import { authService } from '../services/auth/auth-service.js';
import { getDatabase, settings } from '../db/index.js';

export async function registerSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // Get settings
  fastify.get('/api/settings', async (req: FastifyRequest, reply: FastifyReply) => {
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
    const userSettings = await db.query.settings.findFirst({
      where: eq(settings.userId, auth.user.id),
    });

    if (!userSettings) {
      // Return defaults
      return {
        success: true,
        data: {
          settings: {
            userId: auth.user.id,
            theme: 'system',
            navigationMode: 'dropdown',
            emailsPerPage: 50,
            previewLines: 2,
            defaultSignature: '',
            replyQuotePosition: 'top',
            enableDesktopNotifications: true,
            enableSoundNotifications: false,
            autoSyncInterval: 5,
            autoLockTimeout: 15,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    }

    return {
      success: true,
      data: {
        settings: {
          userId: userSettings.userId,
          theme: userSettings.theme,
          navigationMode: userSettings.navigationMode,
          emailsPerPage: userSettings.emailsPerPage,
          previewLines: userSettings.previewLines,
          defaultSignature: userSettings.defaultSignature,
          replyQuotePosition: userSettings.replyQuotePosition,
          enableDesktopNotifications: userSettings.enableDesktopNotifications,
          enableSoundNotifications: userSettings.enableSoundNotifications,
          autoSyncInterval: userSettings.autoSyncInterval,
          autoLockTimeout: userSettings.autoLockTimeout,
          updatedAt: userSettings.updatedAt,
        },
      },
    };
  });

  // Update settings
  fastify.patch('/api/settings', async (req: FastifyRequest, reply: FastifyReply) => {
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

    const parseResult = updateSettingsSchema.safeParse(req.body);
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

    // Check if settings exist
    const existing = await db.query.settings.findFirst({
      where: eq(settings.userId, auth.user.id),
    });

    if (existing) {
      // Update existing
      await db.update(settings)
        .set({
          ...parseResult.data,
          updatedAt: now,
        })
        .where(eq(settings.userId, auth.user.id));
    } else {
      // Insert new
      await db.insert(settings).values({
        userId: auth.user.id,
        ...parseResult.data,
        updatedAt: now,
      });
    }

    // Get updated settings
    const updated = await db.query.settings.findFirst({
      where: eq(settings.userId, auth.user.id),
    });

    return {
      success: true,
      data: {
        settings: updated ? {
          userId: updated.userId,
          theme: updated.theme,
          navigationMode: updated.navigationMode,
          emailsPerPage: updated.emailsPerPage,
          previewLines: updated.previewLines,
          defaultSignature: updated.defaultSignature,
          replyQuotePosition: updated.replyQuotePosition,
          enableDesktopNotifications: updated.enableDesktopNotifications,
          enableSoundNotifications: updated.enableSoundNotifications,
          autoSyncInterval: updated.autoSyncInterval,
          autoLockTimeout: updated.autoLockTimeout,
          updatedAt: updated.updatedAt,
        } : null,
      },
    };
  });
}
