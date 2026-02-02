import type { ImapFlow, FetchMessageObject, MessageStructureObject } from 'imapflow';
import { v4 as uuidv4 } from 'uuid';
import { eq, and, inArray } from 'drizzle-orm';
import { getDatabase, folders, messages, attachments, type NewFolder, type NewMessage, type NewAttachment } from '../../db/index.js';
import { imapConnectionPool } from './connection-pool.js';
import type { EmailAddress } from '@imap-browser/shared';

export interface SyncProgress {
  accountId: string;
  folderId: string;
  phase: 'folders' | 'messages' | 'complete';
  total: number;
  current: number;
}

export class ImapSyncService {
  /**
   * Sync all folders for an account
   */
  async syncFolders(
    accountId: string,
    userPassword: string,
    userSalt: string,
  ): Promise<void> {
    const client = await imapConnectionPool.getConnection(accountId, userPassword, userSalt);
    const db = getDatabase();

    const mailboxes = await client.list();
    const now = new Date().toISOString();

    // Get existing folders
    const existingFolders = await db.query.folders.findMany({
      where: eq(folders.accountId, accountId),
    });
    const existingPaths = new Set(existingFolders.map(f => f.path));

    // Track which folders we've seen
    const seenPaths = new Set<string>();

    for (const mailbox of mailboxes) {
      seenPaths.add(mailbox.path);

      const specialUse = this.detectSpecialUse(mailbox);

      const folderData: NewFolder = {
        id: uuidv4(),
        accountId,
        name: mailbox.name,
        path: mailbox.path,
        delimiter: mailbox.delimiter || '/',
        parentPath: mailbox.parentPath || null,
        specialUse,
        totalMessages: 0,
        unreadMessages: 0,
        uidValidity: null,
        uidNext: null,
        highestModSeq: null,
        isSubscribed: mailbox.subscribed ?? true,
        isSelectable: !mailbox.flags?.has('\\Noselect'),
        hasChildren: mailbox.flags?.has('\\HasChildren') ?? false,
        lastSyncAt: now,
      };

      if (existingPaths.has(mailbox.path)) {
        // Update existing folder
        await db.update(folders)
          .set({
            name: folderData.name,
            parentPath: folderData.parentPath,
            specialUse: folderData.specialUse,
            isSubscribed: folderData.isSubscribed,
            isSelectable: folderData.isSelectable,
            hasChildren: folderData.hasChildren,
            lastSyncAt: now,
          })
          .where(and(
            eq(folders.accountId, accountId),
            eq(folders.path, mailbox.path),
          ));
      } else {
        // Insert new folder
        await db.insert(folders).values(folderData);
      }
    }

    // Delete folders that no longer exist on server
    const deletedPaths = [...existingPaths].filter(p => !seenPaths.has(p));
    if (deletedPaths.length > 0) {
      await db.delete(folders)
        .where(and(
          eq(folders.accountId, accountId),
          inArray(folders.path, deletedPaths),
        ));
    }
  }

  /**
   * Sync messages in a folder
   */
  async syncFolder(
    accountId: string,
    folderPath: string,
    userPassword: string,
    userSalt: string,
    onProgress?: (progress: SyncProgress) => void,
  ): Promise<{ newMessages: number; updatedMessages: number }> {
    const client = await imapConnectionPool.getConnection(accountId, userPassword, userSalt);
    const db = getDatabase();

    // Get folder from database
    const folder = await db.query.folders.findFirst({
      where: and(
        eq(folders.accountId, accountId),
        eq(folders.path, folderPath),
      ),
    });

    if (!folder) {
      throw new Error('Folder not found');
    }

    // Open mailbox
    const mailbox = await client.mailboxOpen(folderPath);

    // Check if UIDVALIDITY changed (requires full resync)
    const uidValidityChanged = folder.uidValidity && folder.uidValidity !== Number(mailbox.uidValidity);
    if (uidValidityChanged) {
      // Delete all messages and resync
      await db.delete(messages).where(eq(messages.folderId, folder.id));
    }

    // Update folder metadata
    await db.update(folders)
      .set({
        uidValidity: mailbox.uidValidity ? Number(mailbox.uidValidity) : null,
        uidNext: mailbox.uidNext ? Number(mailbox.uidNext) : null,
        highestModSeq: mailbox.highestModseq?.toString() || null,
        totalMessages: mailbox.exists,
        lastSyncAt: new Date().toISOString(),
      })
      .where(eq(folders.id, folder.id));

    // Get existing message UIDs
    const existingMessages = await db.query.messages.findMany({
      where: eq(messages.folderId, folder.id),
      columns: { uid: true, flagsJson: true },
    });
    const existingUids = new Map(existingMessages.map(m => [m.uid, m.flagsJson]));

    let newMessages = 0;
    let updatedMessages = 0;

    // Fetch messages
    if (mailbox.exists > 0) {
      // If no messages synced yet OR uidValidity changed, fetch ALL messages
      // Otherwise, only fetch messages we don't have
      const needsFullSync = existingMessages.length === 0 || uidValidityChanged;
      const fetchRange = needsFullSync ? '1:*' : `1:*`;

      const fetchedMessages: FetchMessageObject[] = [];

      try {
        for await (const msg of client.fetch(fetchRange, {
          uid: true,
          envelope: true,
          flags: true,
          bodyStructure: true,
          size: true,
          internalDate: true,
        }, { uid: true })) {
          fetchedMessages.push(msg);
        }
      } catch (fetchError) {
        // Log but continue - partial sync is better than no sync
        console.error(`Error fetching messages from ${folderPath}:`, fetchError);
      }

      const total = fetchedMessages.length;
      let current = 0;

      for (const msg of fetchedMessages) {
        current++;
        if (onProgress) {
          onProgress({
            accountId,
            folderId: folder.id,
            phase: 'messages',
            total,
            current,
          });
        }

        const existingFlags = existingUids.get(msg.uid);

        if (existingFlags === undefined) {
          // New message
          try {
            await this.insertMessage(folder.id, accountId, msg);
            newMessages++;
          } catch (insertError) {
            console.error(`Error inserting message UID ${msg.uid}:`, insertError);
          }
        } else {
          // Check if flags changed
          const newFlags = JSON.stringify(Array.from(msg.flags || []));
          if (existingFlags !== newFlags) {
            await db.update(messages)
              .set({ flagsJson: newFlags })
              .where(and(
                eq(messages.folderId, folder.id),
                eq(messages.uid, msg.uid),
              ));
            updatedMessages++;
          }
        }
      }
    }

    // Update unread count for this folder
    const unreadCount = await this.getUnreadCount(client, folderPath);
    await db.update(folders)
      .set({ unreadMessages: unreadCount })
      .where(eq(folders.id, folder.id));

    if (onProgress) {
      onProgress({
        accountId,
        folderId: folder.id,
        phase: 'complete',
        total: 0,
        current: 0,
      });
    }

    return { newMessages, updatedMessages };
  }

  /**
   * Update unread counts for all folders in an account
   */
  async updateAllFolderCounts(
    accountId: string,
    userPassword: string,
    userSalt: string,
  ): Promise<void> {
    const client = await imapConnectionPool.getConnection(accountId, userPassword, userSalt);
    const db = getDatabase();

    const accountFolders = await db.query.folders.findMany({
      where: eq(folders.accountId, accountId),
    });

    for (const folder of accountFolders) {
      if (!folder.isSelectable) continue;

      try {
        const status = await client.status(folder.path, { unseen: true, messages: true });
        await db.update(folders)
          .set({
            unreadMessages: status.unseen || 0,
            totalMessages: status.messages || 0,
          })
          .where(eq(folders.id, folder.id));
      } catch {
        // Ignore errors for individual folders
      }
    }
  }

  /**
   * Fetch message body (lazy loaded)
   */
  async fetchMessageBody(
    accountId: string,
    messageId: string,
    userPassword: string,
    userSalt: string,
  ): Promise<{ textBody: string | null; htmlBody: string | null }> {
    const db = getDatabase();

    const message = await db.query.messages.findFirst({
      where: eq(messages.id, messageId),
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

    try {
      await client.mailboxOpen(folder.path);
    } catch (openError) {
      throw new Error(`Failed to open folder: ${openError instanceof Error ? openError.message : 'Unknown error'}`);
    }

    let textBody: string | null = null;
    let htmlBody: string | null = null;

    // Try to download the full message first
    try {
      const downloaded = await client.download(message.uid.toString(), undefined, { uid: true });

      if (downloaded?.content) {
        const chunks: Buffer[] = [];
        for await (const chunk of downloaded.content) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const rawContent = Buffer.concat(chunks).toString('utf8');

        // Parse based on content type
        if (downloaded.meta?.contentType?.includes('text/html')) {
          htmlBody = rawContent;
        } else if (downloaded.meta?.contentType?.includes('text/plain')) {
          textBody = rawContent;
        } else {
          // If content type is unknown, try to detect
          if (rawContent.includes('<html') || rawContent.includes('<body') || rawContent.includes('<!DOCTYPE')) {
            htmlBody = rawContent;
          } else {
            textBody = rawContent;
          }
        }
      }
    } catch (downloadError) {
      console.error(`Error downloading message ${message.uid}:`, downloadError);
      // Continue to try fetching body parts
    }

    // Try to get specific body parts if we don't have content yet
    if (!textBody && !htmlBody) {
      try {
        for await (const msg of client.fetch(message.uid.toString(), {
          bodyParts: ['TEXT', '1', '1.1', '1.2', '2'],
        }, { uid: true })) {
          if (msg.bodyParts) {
            for (const [_partId, content] of msg.bodyParts) {
              const text = content?.toString('utf8') || '';
              if (!text) continue;

              // Heuristic: HTML usually has tags
              if (text.includes('<html') || text.includes('<body') || text.includes('<div') || text.includes('<!DOCTYPE')) {
                if (!htmlBody) htmlBody = text;
              } else if (!textBody) {
                textBody = text;
              }
            }
          }
        }
      } catch (fetchError) {
        console.error(`Error fetching body parts for message ${message.uid}:`, fetchError);
      }
    }

    // If we still have nothing, return empty content with a note
    if (!textBody && !htmlBody) {
      textBody = '(Unable to load message content)';
    }

    return { textBody, htmlBody };
  }

  private async insertMessage(
    folderId: string,
    accountId: string,
    msg: FetchMessageObject,
  ): Promise<void> {
    const db = getDatabase();
    const messageId = uuidv4();
    const now = new Date().toISOString();

    const envelope = msg.envelope;
    const structure = msg.bodyStructure;

    // Parse addresses
    const from = this.parseAddresses(envelope?.from);
    const to = this.parseAddresses(envelope?.to);
    const cc = this.parseAddresses(envelope?.cc);
    const bcc = this.parseAddresses(envelope?.bcc);
    const replyTo = this.parseAddresses(envelope?.replyTo);

    // Detect attachments
    const attachmentInfos = this.findAttachments(structure);
    const hasAttachments = attachmentInfos.length > 0;

    // Generate preview text (first 200 chars of subject for now)
    const previewText = envelope?.subject?.substring(0, 200) || '';

    const messageData: NewMessage = {
      id: messageId,
      accountId,
      folderId,
      uid: msg.uid,
      messageId: envelope?.messageId || null,
      subject: envelope?.subject || '(no subject)',
      fromJson: JSON.stringify(from),
      toJson: JSON.stringify(to),
      ccJson: JSON.stringify(cc),
      bccJson: JSON.stringify(bcc),
      replyToJson: JSON.stringify(replyTo),
      date: envelope?.date instanceof Date ? envelope.date.toISOString() : (envelope?.date || now),
      receivedAt: msg.internalDate instanceof Date ? msg.internalDate.toISOString() : (msg.internalDate || now),
      flagsJson: JSON.stringify(Array.from(msg.flags || [])),
      size: msg.size || 0,
      hasAttachments,
      previewText,
      threadId: null,
      inReplyTo: envelope?.inReplyTo || null,
      referencesJson: JSON.stringify(this.parseReferences(envelope?.messageId)),
    };

    await db.insert(messages).values(messageData);

    // Insert attachment metadata
    for (const att of attachmentInfos) {
      const attachmentData: NewAttachment = {
        id: uuidv4(),
        messageId,
        filename: att.filename || 'attachment',
        contentType: att.contentType || 'application/octet-stream',
        size: att.size || 0,
        contentId: att.contentId || null,
        disposition: att.disposition === 'inline' ? 'inline' : 'attachment',
        partId: att.partId,
      };
      await db.insert(attachments).values(attachmentData);
    }
  }

  private parseAddresses(addresses: Array<{ name?: string; address?: string }> | undefined): EmailAddress[] {
    if (!addresses) return [];
    return addresses
      .filter(a => a.address)
      .map(a => ({
        name: a.name || undefined,
        address: a.address!,
      }));
  }

  private parseReferences(_messageId: string | undefined | null): string[] {
    // Would parse References header, simplified for now
    return [];
  }

  private findAttachments(structure: MessageStructureObject | undefined): Array<{
    filename?: string;
    contentType?: string;
    size?: number;
    contentId?: string;
    disposition?: string;
    partId: string;
  }> {
    const attachments: Array<{
      filename?: string;
      contentType?: string;
      size?: number;
      contentId?: string;
      disposition?: string;
      partId: string;
    }> = [];

    const traverse = (node: MessageStructureObject, partId: string) => {
      if (node.disposition === 'attachment' || node.disposition === 'inline') {
        attachments.push({
          filename: node.dispositionParameters?.filename || node.parameters?.name,
          contentType: node.type,
          size: node.size,
          contentId: node.id || undefined,
          disposition: node.disposition,
          partId,
        });
      }

      if (node.childNodes) {
        node.childNodes.forEach((child, index) => {
          traverse(child, `${partId}.${index + 1}`);
        });
      }
    };

    if (structure) {
      traverse(structure, '1');
    }

    return attachments;
  }

  private async getUnreadCount(client: ImapFlow, folderPath: string): Promise<number> {
    try {
      const status = await client.status(folderPath, { unseen: true });
      return status.unseen || 0;
    } catch {
      return 0;
    }
  }

  private detectSpecialUse(mailbox: { path: string; specialUse?: string; flags?: Set<string> }): string | null {
    if (mailbox.specialUse) {
      return mailbox.specialUse.toLowerCase().replace('\\', '');
    }

    // Detect by common names
    const name = mailbox.path.toLowerCase();
    if (name === 'inbox') return 'inbox';
    if (name.includes('sent')) return 'sent';
    if (name.includes('draft')) return 'drafts';
    if (name.includes('trash') || name.includes('deleted')) return 'trash';
    if (name.includes('spam') || name.includes('junk')) return 'spam';
    if (name.includes('archive')) return 'archive';

    return null;
  }
}

// Singleton instance
export const imapSyncService = new ImapSyncService();
