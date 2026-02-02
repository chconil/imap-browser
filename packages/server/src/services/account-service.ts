import { eq, and, asc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, accounts, folders, type Account, type NewAccount } from '../db/index.js';
import { EncryptionService } from './auth/encryption-service.js';
import { imapConnectionPool } from './imap/connection-pool.js';
import { imapSyncService } from './imap/sync-service.js';
import type { CreateAccountInput, UpdateAccountInput, Account as AccountType, Folder } from '@imap-browser/shared';

export class AccountService {
  /**
   * Get all accounts for a user
   */
  async getAccounts(userId: string): Promise<AccountType[]> {
    const db = getDatabase();

    const rows = await db.query.accounts.findMany({
      where: eq(accounts.userId, userId),
      orderBy: asc(accounts.sortOrder),
    });

    return rows.map(this.toAccountType);
  }

  /**
   * Get a single account
   */
  async getAccount(userId: string, accountId: string): Promise<AccountType | null> {
    const db = getDatabase();

    const account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.id, accountId),
        eq(accounts.userId, userId),
      ),
    });

    return account ? this.toAccountType(account) : null;
  }

  /**
   * Create a new IMAP account
   */
  async createAccount(
    userId: string,
    input: CreateAccountInput,
    userPassword: string,
    userSalt: string,
  ): Promise<AccountType> {
    const db = getDatabase();

    // Test IMAP connection first
    const testResult = await this.testImapConnection(
      input.imapHost,
      input.imapPort,
      input.imapSecurity,
      input.imapUsername,
      input.imapPassword,
    );

    if (!testResult.success) {
      throw new Error(`IMAP connection failed: ${testResult.error}`);
    }

    // Encrypt credentials - each field gets its own IV for security
    const key = await EncryptionService.deriveKey(userPassword, userSalt);

    const imapUsernameEncrypted = EncryptionService.encrypt(input.imapUsername, key);
    const imapPasswordEncrypted = EncryptionService.encrypt(input.imapPassword, key);

    // SMTP credentials (use IMAP if not provided)
    const smtpUsername = input.smtpUsername || input.imapUsername;
    const smtpPassword = input.smtpPassword || input.imapPassword;

    const smtpUsernameEncrypted = EncryptionService.encrypt(smtpUsername, key);
    const smtpPasswordEncrypted = EncryptionService.encrypt(smtpPassword, key);

    const now = new Date().toISOString();

    // Get next sort order
    const existingAccounts = await db.query.accounts.findMany({
      where: eq(accounts.userId, userId),
      columns: { sortOrder: true },
    });
    const maxSortOrder = Math.max(0, ...existingAccounts.map(a => a.sortOrder));

    const accountId = uuidv4();

    const accountData: NewAccount = {
      id: accountId,
      userId,
      name: input.name,
      email: input.email,
      imapHost: input.imapHost,
      imapPort: input.imapPort,
      imapSecurity: input.imapSecurity,
      imapUsername: imapUsernameEncrypted.ciphertext,
      imapPassword: imapPasswordEncrypted.ciphertext,
      imapIv: imapUsernameEncrypted.iv,
      imapPasswordIv: imapPasswordEncrypted.iv,
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpSecurity: input.smtpSecurity,
      smtpUsername: smtpUsernameEncrypted.ciphertext,
      smtpPassword: smtpPasswordEncrypted.ciphertext,
      smtpIv: smtpUsernameEncrypted.iv,
      smtpPasswordIv: smtpPasswordEncrypted.iv,
      isConnected: false,
      lastSyncAt: null,
      lastError: null,
      sortOrder: maxSortOrder + 1,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(accounts).values(accountData);

    // Connect and sync folders
    try {
      await imapConnectionPool.connect(accountId, userPassword, userSalt);
      await imapSyncService.syncFolders(accountId, userPassword, userSalt);
    } catch (error) {
      // Log but don't fail - account is created, sync can happen later
      console.error('Initial sync failed:', error);
    }

    const account = await db.query.accounts.findFirst({
      where: eq(accounts.id, accountId),
    });

    if (!account) {
      throw new Error('Failed to create account');
    }

    return this.toAccountType(account);
  }

  /**
   * Update an account
   */
  async updateAccount(
    userId: string,
    accountId: string,
    input: UpdateAccountInput,
    userPassword: string,
    userSalt: string,
  ): Promise<AccountType> {
    const db = getDatabase();

    const account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.id, accountId),
        eq(accounts.userId, userId),
      ),
    });

    if (!account) {
      throw new Error('Account not found');
    }

    const updates: Partial<Account> = {
      updatedAt: new Date().toISOString(),
    };

    if (input.name) updates.name = input.name;
    if (input.imapHost) updates.imapHost = input.imapHost;
    if (input.imapPort) updates.imapPort = input.imapPort;
    if (input.imapSecurity) updates.imapSecurity = input.imapSecurity;
    if (input.smtpHost) updates.smtpHost = input.smtpHost;
    if (input.smtpPort) updates.smtpPort = input.smtpPort;
    if (input.smtpSecurity) updates.smtpSecurity = input.smtpSecurity;
    if (typeof input.sortOrder === 'number') updates.sortOrder = input.sortOrder;

    // Handle credential updates - each field gets its own IV
    if (input.imapUsername || input.imapPassword) {
      const key = await EncryptionService.deriveKey(userPassword, userSalt);

      if (input.imapUsername) {
        const encrypted = EncryptionService.encrypt(input.imapUsername, key);
        updates.imapUsername = encrypted.ciphertext;
        updates.imapIv = encrypted.iv;
      }

      if (input.imapPassword) {
        const encrypted = EncryptionService.encrypt(input.imapPassword, key);
        updates.imapPassword = encrypted.ciphertext;
        updates.imapPasswordIv = encrypted.iv;
      }

      // Disconnect existing connection to force reconnect with new credentials
      await imapConnectionPool.disconnect(accountId);
    }

    if (input.smtpUsername || input.smtpPassword) {
      const key = await EncryptionService.deriveKey(userPassword, userSalt);

      if (input.smtpUsername) {
        const encrypted = EncryptionService.encrypt(input.smtpUsername, key);
        updates.smtpUsername = encrypted.ciphertext;
        updates.smtpIv = encrypted.iv;
      }

      if (input.smtpPassword) {
        const encrypted = EncryptionService.encrypt(input.smtpPassword, key);
        updates.smtpPassword = encrypted.ciphertext;
        updates.smtpPasswordIv = encrypted.iv;
      }
    }

    await db.update(accounts)
      .set(updates)
      .where(eq(accounts.id, accountId));

    const updated = await db.query.accounts.findFirst({
      where: eq(accounts.id, accountId),
    });

    if (!updated) {
      throw new Error('Failed to update account');
    }

    return this.toAccountType(updated);
  }

  /**
   * Delete an account
   */
  async deleteAccount(userId: string, accountId: string): Promise<void> {
    const db = getDatabase();

    const account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.id, accountId),
        eq(accounts.userId, userId),
      ),
    });

    if (!account) {
      throw new Error('Account not found');
    }

    // Disconnect first
    await imapConnectionPool.disconnect(accountId);

    // Cascade delete will handle related records
    await db.delete(accounts).where(eq(accounts.id, accountId));
  }

  /**
   * Get folders for an account
   */
  async getFolders(userId: string, accountId: string): Promise<Folder[]> {
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

    const rows = await db.query.folders.findMany({
      where: eq(folders.accountId, accountId),
    });

    return rows.map(folder => ({
      id: folder.id,
      accountId: folder.accountId,
      name: folder.name,
      path: folder.path,
      delimiter: folder.delimiter,
      parentPath: folder.parentPath,
      specialUse: folder.specialUse,
      totalMessages: folder.totalMessages,
      unreadMessages: folder.unreadMessages,
      uidValidity: folder.uidValidity,
      uidNext: folder.uidNext,
      highestModSeq: folder.highestModSeq,
      isSubscribed: folder.isSubscribed,
      isSelectable: folder.isSelectable,
      hasChildren: folder.hasChildren,
      lastSyncAt: folder.lastSyncAt,
    }));
  }

  /**
   * Test IMAP connection without saving
   */
  async testImapConnection(
    host: string,
    port: number,
    security: 'tls' | 'starttls' | 'none',
    username: string,
    password: string,
  ): Promise<{ success: boolean; error?: string }> {
    const { ImapFlow } = await import('imapflow');

    const client = new ImapFlow({
      host,
      port,
      secure: security === 'tls',
      auth: { user: username, pass: password },
      logger: false,
      tls: security !== 'none' ? {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
      } : undefined,
    });

    try {
      await client.connect();
      await client.logout();
      return { success: true };
    } catch (error) {
      // ImapFlow errors have responseText with server's actual response
      let errorMessage = 'Connection failed';
      if (error instanceof Error) {
        // Check for ImapFlow-specific error properties
        const imapError = error as Error & { responseText?: string; code?: string };
        if (imapError.responseText) {
          // Server returned a specific error message
          errorMessage = imapError.responseText;

          // Add helpful hints for common auth errors
          const isGmail = host.includes('gmail.com');
          const isOutlook = host.includes('outlook') || host.includes('office365');

          if (errorMessage.toLowerCase().includes('invalid credentials') ||
              errorMessage.toLowerCase().includes('authentication failed')) {
            if (isGmail) {
              errorMessage += '. For Gmail, you must use an App Password: enable 2FA at https://myaccount.google.com/security, then create an App Password at https://myaccount.google.com/apppasswords';
            } else if (isOutlook) {
              errorMessage += '. For Outlook/Office365, you may need to enable IMAP access and use an App Password if 2FA is enabled';
            }
          }
        } else if (imapError.code === 'ENOTFOUND') {
          errorMessage = `Server not found: ${host}`;
        } else if (imapError.code === 'ECONNREFUSED') {
          errorMessage = `Connection refused by ${host}:${port}`;
        } else if (imapError.code === 'ETIMEDOUT') {
          errorMessage = `Connection timed out to ${host}:${port}`;
        } else if (error.message.includes('certificate')) {
          errorMessage = `TLS certificate error: ${error.message}`;
        } else if (error.message === 'Command failed') {
          errorMessage = 'Authentication failed. Check your username and password.';
        } else {
          errorMessage = error.message;
        }
      }
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Reorder accounts
   */
  async reorderAccounts(
    userId: string,
    accountIds: string[],
  ): Promise<void> {
    const db = getDatabase();

    for (let i = 0; i < accountIds.length; i++) {
      await db.update(accounts)
        .set({ sortOrder: i, updatedAt: new Date().toISOString() })
        .where(and(
          eq(accounts.id, accountIds[i]),
          eq(accounts.userId, userId),
        ));
    }
  }

  private toAccountType(account: Account): AccountType {
    return {
      id: account.id,
      userId: account.userId,
      name: account.name,
      email: account.email,
      imapHost: account.imapHost,
      imapPort: account.imapPort,
      imapSecurity: account.imapSecurity,
      smtpHost: account.smtpHost,
      smtpPort: account.smtpPort,
      smtpSecurity: account.smtpSecurity,
      isConnected: account.isConnected,
      lastSyncAt: account.lastSyncAt,
      lastError: account.lastError,
      sortOrder: account.sortOrder,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }
}

// Singleton instance
export const accountService = new AccountService();
