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

    // Encrypt credentials
    const key = await EncryptionService.deriveKey(userPassword, userSalt);

    const imapEncrypted = EncryptionService.encrypt(input.imapUsername, key);
    const imapPasswordEncrypted = EncryptionService.encrypt(input.imapPassword, key);

    // SMTP credentials (use IMAP if not provided)
    const smtpUsername = input.smtpUsername || input.imapUsername;
    const smtpPassword = input.smtpPassword || input.imapPassword;

    const smtpEncrypted = EncryptionService.encrypt(smtpUsername, key);
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
      imapUsername: imapEncrypted.ciphertext,
      imapPassword: imapPasswordEncrypted.ciphertext,
      imapIv: imapEncrypted.iv,
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpSecurity: input.smtpSecurity,
      smtpUsername: smtpEncrypted.ciphertext,
      smtpPassword: smtpPasswordEncrypted.ciphertext,
      smtpIv: smtpEncrypted.iv,
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

    // Handle credential updates
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
        // Use same IV as username if both updated, otherwise keep existing
        if (!input.imapUsername) {
          updates.imapIv = encrypted.iv;
        }
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
        if (!input.smtpUsername) {
          updates.smtpIv = encrypted.iv;
        }
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
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
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
