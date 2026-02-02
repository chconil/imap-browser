import { eq, and, desc, asc, like, inArray, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, messages, messageBodies, folders, accounts, attachments } from '../../db/index.js';
import { imapConnectionPool } from '../imap/connection-pool.js';
import { imapSyncService } from '../imap/sync-service.js';
import type { EmailHeader, EmailListQuery, EmailListResponse, Email, FlagUpdateInput, MoveEmailsInput, SearchQuery } from '@imap-browser/shared';

export class EmailService {
  /**
   * Get paginated list of emails in a folder
   */
  async getEmails(
    userId: string,
    query: EmailListQuery,
  ): Promise<EmailListResponse> {
    const db = getDatabase();

    // Verify user owns this account
    const account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.id, query.accountId),
        eq(accounts.userId, userId),
      ),
    });

    if (!account) {
      throw new Error('Account not found');
    }

    // Build query
    const offset = (query.page - 1) * query.pageSize;

    const orderBy = query.sortOrder === 'asc'
      ? asc(messages.date)
      : desc(messages.date);

    const conditions = [
      eq(messages.accountId, query.accountId),
      eq(messages.folderId, query.folderId),
    ];

    if (query.search) {
      conditions.push(like(messages.subject, `%${query.search}%`));
    }

    // Get total count
    const countResult = await db.select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(and(...conditions));
    const total = countResult[0]?.count || 0;

    // Get messages
    const rows = await db.query.messages.findMany({
      where: and(...conditions),
      orderBy,
      limit: query.pageSize,
      offset,
    });

    const emails: EmailHeader[] = rows.map(msg => ({
      id: msg.id,
      accountId: msg.accountId,
      folderId: msg.folderId,
      uid: msg.uid,
      messageId: msg.messageId,
      subject: msg.subject,
      from: JSON.parse(msg.fromJson),
      to: JSON.parse(msg.toJson),
      cc: JSON.parse(msg.ccJson),
      bcc: JSON.parse(msg.bccJson),
      replyTo: JSON.parse(msg.replyToJson),
      date: msg.date,
      receivedAt: msg.receivedAt,
      flags: JSON.parse(msg.flagsJson),
      size: msg.size,
      hasAttachments: msg.hasAttachments,
      previewText: msg.previewText,
      threadId: msg.threadId,
    }));

    return {
      emails,
      total,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: offset + emails.length < total,
    };
  }

  /**
   * Get full email with body
   */
  async getEmail(
    userId: string,
    accountId: string,
    messageId: string,
    userPassword: string,
    userSalt: string,
  ): Promise<Email> {
    const db = getDatabase();

    // Verify user owns this account
    const account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.id, accountId),
        eq(accounts.userId, userId),
      ),
    });

    if (!account) {
      throw new Error('Account not found');
    }

    const message = await db.query.messages.findFirst({
      where: and(
        eq(messages.id, messageId),
        eq(messages.accountId, accountId),
      ),
    });

    if (!message) {
      throw new Error('Message not found');
    }

    // Check if body is cached
    let body = await db.query.messageBodies.findFirst({
      where: eq(messageBodies.messageId, messageId),
    });

    if (!body) {
      // Fetch body from IMAP
      const { textBody, htmlBody } = await imapSyncService.fetchMessageBody(
        accountId,
        messageId,
        userPassword,
        userSalt,
      );

      // Cache body
      await db.insert(messageBodies).values({
        id: uuidv4(),
        messageId,
        textBody,
        htmlBody,
        rawHeadersJson: null,
        fetchedAt: new Date().toISOString(),
      });

      body = { id: '', messageId, textBody, htmlBody, rawHeadersJson: null, fetchedAt: '' };
    }

    // Get attachments
    const attachmentList = await db.query.attachments.findMany({
      where: eq(attachments.messageId, messageId),
    });

    return {
      id: message.id,
      accountId: message.accountId,
      folderId: message.folderId,
      uid: message.uid,
      messageId: message.messageId,
      subject: message.subject,
      from: JSON.parse(message.fromJson),
      to: JSON.parse(message.toJson),
      cc: JSON.parse(message.ccJson),
      bcc: JSON.parse(message.bccJson),
      replyTo: JSON.parse(message.replyToJson),
      date: message.date,
      receivedAt: message.receivedAt,
      flags: JSON.parse(message.flagsJson),
      size: message.size,
      hasAttachments: message.hasAttachments,
      previewText: message.previewText,
      threadId: message.threadId,
      textBody: body.textBody,
      htmlBody: body.htmlBody,
      attachments: attachmentList.map(att => ({
        id: att.id,
        messageId: att.messageId,
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        contentId: att.contentId,
        disposition: att.disposition,
        partId: att.partId,
      })),
    };
  }

  /**
   * Update flags on messages
   */
  async updateFlags(
    userId: string,
    accountId: string,
    input: FlagUpdateInput,
    userPassword: string,
    userSalt: string,
  ): Promise<void> {
    const db = getDatabase();

    // Verify user owns this account
    const account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.id, accountId),
        eq(accounts.userId, userId),
      ),
    });

    if (!account) {
      throw new Error('Account not found');
    }

    const client = await imapConnectionPool.getConnection(accountId, userPassword, userSalt);

    // Group messages by folder
    const messageRows = await db.query.messages.findMany({
      where: and(
        eq(messages.accountId, accountId),
        inArray(messages.id, input.emailIds),
      ),
    });

    const byFolder = new Map<string, typeof messageRows>();
    for (const msg of messageRows) {
      const existing = byFolder.get(msg.folderId) || [];
      existing.push(msg);
      byFolder.set(msg.folderId, existing);
    }

    // Update flags per folder
    for (const [folderId, folderMessages] of byFolder) {
      const folder = await db.query.folders.findFirst({
        where: eq(folders.id, folderId),
      });

      if (!folder) continue;

      await client.mailboxOpen(folder.path);

      const uids = folderMessages.map(m => m.uid);
      const uidRange = uids.join(',');

      if (input.addFlags?.length) {
        await client.messageFlagsAdd(uidRange, input.addFlags, { uid: true });
      }

      if (input.removeFlags?.length) {
        await client.messageFlagsRemove(uidRange, input.removeFlags, { uid: true });
      }

      // Update local database
      for (const msg of folderMessages) {
        let currentFlags: string[] = JSON.parse(msg.flagsJson);

        if (input.addFlags) {
          currentFlags = [...new Set([...currentFlags, ...input.addFlags])];
        }

        if (input.removeFlags) {
          currentFlags = currentFlags.filter(f => !input.removeFlags?.includes(f));
        }

        await db.update(messages)
          .set({ flagsJson: JSON.stringify(currentFlags) })
          .where(eq(messages.id, msg.id));
      }
    }
  }

  /**
   * Move messages to another folder
   */
  async moveMessages(
    userId: string,
    accountId: string,
    input: MoveEmailsInput,
    userPassword: string,
    userSalt: string,
  ): Promise<void> {
    const db = getDatabase();

    // Verify user owns this account
    const account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.id, accountId),
        eq(accounts.userId, userId),
      ),
    });

    if (!account) {
      throw new Error('Account not found');
    }

    const targetFolder = await db.query.folders.findFirst({
      where: and(
        eq(folders.id, input.targetFolderId),
        eq(folders.accountId, accountId),
      ),
    });

    if (!targetFolder) {
      throw new Error('Target folder not found');
    }

    const client = await imapConnectionPool.getConnection(accountId, userPassword, userSalt);

    // Group messages by source folder
    const messageRows = await db.query.messages.findMany({
      where: and(
        eq(messages.accountId, accountId),
        inArray(messages.id, input.emailIds),
      ),
    });

    const byFolder = new Map<string, typeof messageRows>();
    for (const msg of messageRows) {
      const existing = byFolder.get(msg.folderId) || [];
      existing.push(msg);
      byFolder.set(msg.folderId, existing);
    }

    // Move messages per source folder
    for (const [folderId, folderMessages] of byFolder) {
      const sourceFolder = await db.query.folders.findFirst({
        where: eq(folders.id, folderId),
      });

      if (!sourceFolder) continue;

      await client.mailboxOpen(sourceFolder.path);

      const uids = folderMessages.map(m => m.uid);
      const uidRange = uids.join(',');

      // IMAP MOVE command
      await client.messageMove(uidRange, targetFolder.path, { uid: true });

      // Update local database - delete old messages, they'll be synced in target
      await db.delete(messages)
        .where(inArray(messages.id, folderMessages.map(m => m.id)));
    }

    // Trigger sync of target folder
    // This will be handled by the caller or background job
  }

  /**
   * Delete messages (move to trash or permanent delete)
   */
  async deleteMessages(
    userId: string,
    accountId: string,
    emailIds: string[],
    permanent: boolean,
    userPassword: string,
    userSalt: string,
  ): Promise<void> {
    const db = getDatabase();

    // Verify user owns this account
    const account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.id, accountId),
        eq(accounts.userId, userId),
      ),
    });

    if (!account) {
      throw new Error('Account not found');
    }

    if (permanent) {
      // Add \Deleted flag and expunge
      await this.updateFlags(userId, accountId, {
        emailIds,
        addFlags: ['\\Deleted'],
      }, userPassword, userSalt);

      // Expunge
      const messageRows = await db.query.messages.findMany({
        where: inArray(messages.id, emailIds),
      });

      const folderIds = [...new Set(messageRows.map(m => m.folderId))];
      const client = await imapConnectionPool.getConnection(accountId, userPassword, userSalt);

      for (const folderId of folderIds) {
        const folder = await db.query.folders.findFirst({
          where: eq(folders.id, folderId),
        });

        if (folder) {
          await client.mailboxOpen(folder.path);
          await client.messageDelete('1:*', { uid: true });
        }
      }

      // Delete from local database
      await db.delete(messages).where(inArray(messages.id, emailIds));
    } else {
      // Move to trash
      const trashFolder = await db.query.folders.findFirst({
        where: and(
          eq(folders.accountId, accountId),
          eq(folders.specialUse, 'trash'),
        ),
      });

      if (trashFolder) {
        await this.moveMessages(userId, accountId, {
          emailIds,
          targetFolderId: trashFolder.id,
        }, userPassword, userSalt);
      } else {
        // No trash folder, permanent delete
        await this.deleteMessages(userId, accountId, emailIds, true, userPassword, userSalt);
      }
    }
  }

  /**
   * Search messages
   */
  async searchMessages(
    userId: string,
    query: SearchQuery,
  ): Promise<EmailHeader[]> {
    const db = getDatabase();

    const conditions = [];

    if (query.accountId) {
      // Verify user owns this account
      const account = await db.query.accounts.findFirst({
        where: and(
          eq(accounts.id, query.accountId),
          eq(accounts.userId, userId),
        ),
      });

      if (!account) {
        throw new Error('Account not found');
      }

      conditions.push(eq(messages.accountId, query.accountId));
    } else {
      // Search across all user's accounts
      const userAccounts = await db.query.accounts.findMany({
        where: eq(accounts.userId, userId),
        columns: { id: true },
      });

      if (userAccounts.length === 0) {
        return [];
      }

      conditions.push(inArray(messages.accountId, userAccounts.map(a => a.id)));
    }

    if (query.folderId) {
      conditions.push(eq(messages.folderId, query.folderId));
    }

    if (query.query) {
      conditions.push(like(messages.subject, `%${query.query}%`));
    }

    if (query.from) {
      conditions.push(like(messages.fromJson, `%${query.from}%`));
    }

    if (query.to) {
      conditions.push(like(messages.toJson, `%${query.to}%`));
    }

    if (query.subject) {
      conditions.push(like(messages.subject, `%${query.subject}%`));
    }

    const rows = await db.query.messages.findMany({
      where: and(...conditions),
      orderBy: desc(messages.date),
      limit: 100,
    });

    return rows.map(msg => ({
      id: msg.id,
      accountId: msg.accountId,
      folderId: msg.folderId,
      uid: msg.uid,
      messageId: msg.messageId,
      subject: msg.subject,
      from: JSON.parse(msg.fromJson),
      to: JSON.parse(msg.toJson),
      cc: JSON.parse(msg.ccJson),
      bcc: JSON.parse(msg.bccJson),
      replyTo: JSON.parse(msg.replyToJson),
      date: msg.date,
      receivedAt: msg.receivedAt,
      flags: JSON.parse(msg.flagsJson),
      size: msg.size,
      hasAttachments: msg.hasAttachments,
      previewText: msg.previewText,
      threadId: msg.threadId,
    }));
  }

  /**
   * Stream attachment content
   */
  async getAttachment(
    userId: string,
    accountId: string,
    attachmentId: string,
    userPassword: string,
    userSalt: string,
  ): Promise<{ stream: AsyncIterable<Buffer>; contentType: string; filename: string; size: number }> {
    const db = getDatabase();

    // Verify user owns this account
    const account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.id, accountId),
        eq(accounts.userId, userId),
      ),
    });

    if (!account) {
      throw new Error('Account not found');
    }

    const attachment = await db.query.attachments.findFirst({
      where: eq(attachments.id, attachmentId),
    });

    if (!attachment) {
      throw new Error('Attachment not found');
    }

    const message = await db.query.messages.findFirst({
      where: eq(messages.id, attachment.messageId),
    });

    if (!message || message.accountId !== accountId) {
      throw new Error('Message not found');
    }

    const folder = await db.query.folders.findFirst({
      where: eq(folders.id, message.folderId),
    });

    if (!folder) {
      throw new Error('Folder not found');
    }

    const client = await imapConnectionPool.getConnection(accountId, userPassword, userSalt);

    await client.mailboxOpen(folder.path);

    const downloaded = await client.download(message.uid.toString(), attachment.partId, { uid: true });

    if (!downloaded?.content) {
      throw new Error('Failed to download attachment');
    }

    return {
      stream: downloaded.content as AsyncIterable<Buffer>,
      contentType: attachment.contentType,
      filename: attachment.filename,
      size: attachment.size,
    };
  }
}

// Singleton instance
export const emailService = new EmailService();
