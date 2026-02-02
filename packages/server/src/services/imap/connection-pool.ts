import { ImapFlow, type ImapFlowOptions, type MailboxObject } from 'imapflow';
import { EventEmitter } from 'events';
import { getDatabase, accounts } from '../../db/index.js';
import { EncryptionService } from '../auth/encryption-service.js';
import { eq } from 'drizzle-orm';

export interface ConnectionInfo {
  accountId: string;
  client: ImapFlow;
  isConnected: boolean;
  isIdle: boolean;
  lastActivity: number;
  selectedMailbox: string | null;
}

export interface ConnectionEvents {
  connected: (accountId: string) => void;
  disconnected: (accountId: string, reason?: string) => void;
  error: (accountId: string, error: Error) => void;
  newMail: (accountId: string, mailbox: string, count: number) => void;
  mailboxUpdate: (accountId: string, mailbox: string, info: MailboxObject) => void;
}

export class ImapConnectionPool extends EventEmitter {
  private connections = new Map<string, ConnectionInfo>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private readonly maxIdleTime = 30 * 60 * 1000; // 30 minutes

  constructor() {
    super();
    this.startCleanup();
  }

  private startCleanup(): void {
    // Clean up stale connections every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleConnections();
    }, 5 * 60 * 1000);
  }

  private async cleanupStaleConnections(): Promise<void> {
    const now = Date.now();
    for (const [accountId, info] of this.connections) {
      if (now - info.lastActivity > this.maxIdleTime) {
        await this.disconnect(accountId);
      }
    }
  }

  /**
   * Get or create a connection for an account
   */
  async getConnection(
    accountId: string,
    userPassword: string,
    userSalt: string,
  ): Promise<ImapFlow> {
    const existing = this.connections.get(accountId);
    if (existing?.isConnected) {
      existing.lastActivity = Date.now();
      return existing.client;
    }

    return this.connect(accountId, userPassword, userSalt);
  }

  /**
   * Connect to an IMAP account
   */
  async connect(
    accountId: string,
    userPassword: string,
    userSalt: string,
  ): Promise<ImapFlow> {
    const db = getDatabase();

    const account = await db.query.accounts.findFirst({
      where: eq(accounts.id, accountId),
    });

    if (!account) {
      throw new Error('Account not found');
    }

    // Decrypt credentials (each has its own IV)
    const key = await EncryptionService.deriveKey(userPassword, userSalt);
    const imapUsername = EncryptionService.decrypt(account.imapUsername, account.imapIv, key);
    const imapPassword = EncryptionService.decrypt(account.imapPassword, account.imapPasswordIv, key);

    const options: ImapFlowOptions = {
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapSecurity === 'tls',
      auth: {
        user: imapUsername,
        pass: imapPassword,
      },
      logger: false, // Disable verbose logging
      tls: account.imapSecurity !== 'none' ? {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
      } : undefined,
    };

    if (account.imapSecurity === 'starttls') {
      options.secure = false;
      options.tls = {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
      };
    }

    const client = new ImapFlow(options);

    // Set up event handlers
    client.on('error', (err) => {
      this.handleError(accountId, err);
    });

    client.on('close', () => {
      this.handleDisconnect(accountId);
    });

    client.on('exists', (info) => {
      this.handleNewMail(accountId, info);
    });

    client.on('flags', (info) => {
      this.handleFlagsUpdate(accountId, info);
    });

    try {
      await client.connect();

      this.connections.set(accountId, {
        accountId,
        client,
        isConnected: true,
        isIdle: false,
        lastActivity: Date.now(),
        selectedMailbox: null,
      });

      // Update account status in database
      await db.update(accounts)
        .set({
          isConnected: true,
          lastError: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(accounts.id, accountId));

      this.emit('connected', accountId);

      return client;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Update account with error
      await db.update(accounts)
        .set({
          isConnected: false,
          lastError: errorMessage,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(accounts.id, accountId));

      throw error;
    }
  }

  /**
   * Disconnect from an account
   */
  async disconnect(accountId: string): Promise<void> {
    const info = this.connections.get(accountId);
    if (!info) return;

    try {
      if (info.client) {
        await info.client.logout();
      }
    } catch {
      // Ignore logout errors
    }

    this.connections.delete(accountId);

    const db = getDatabase();
    await db.update(accounts)
      .set({
        isConnected: false,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(accounts.id, accountId));

    this.emit('disconnected', accountId);
  }

  /**
   * Start IDLE mode for real-time updates
   */
  async startIdle(accountId: string, mailbox: string): Promise<void> {
    const info = this.connections.get(accountId);
    if (!info?.isConnected) {
      throw new Error('Not connected');
    }

    // Select mailbox if not already selected
    if (info.selectedMailbox !== mailbox) {
      await info.client.mailboxOpen(mailbox);
      info.selectedMailbox = mailbox;
    }

    info.isIdle = true;
    // ImapFlow automatically handles IDLE internally
  }

  /**
   * Stop IDLE mode
   */
  stopIdle(accountId: string): void {
    const info = this.connections.get(accountId);
    if (info) {
      info.isIdle = false;
    }
  }

  /**
   * Check if account is connected
   */
  isConnected(accountId: string): boolean {
    return this.connections.get(accountId)?.isConnected ?? false;
  }

  /**
   * Get all connected account IDs
   */
  getConnectedAccounts(): string[] {
    return Array.from(this.connections.entries())
      .filter(([_, info]) => info.isConnected)
      .map(([id]) => id);
  }

  /**
   * Disconnect all connections
   */
  async disconnectAll(): Promise<void> {
    const accountIds = Array.from(this.connections.keys());
    await Promise.all(accountIds.map(id => this.disconnect(id)));
  }

  /**
   * Stop the connection pool
   */
  async stop(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    await this.disconnectAll();
  }

  private handleError(accountId: string, error: Error): void {
    const info = this.connections.get(accountId);
    if (info) {
      info.isConnected = false;
    }

    this.emit('error', accountId, error);
  }

  private handleDisconnect(accountId: string): void {
    const info = this.connections.get(accountId);
    if (info) {
      info.isConnected = false;
    }

    this.emit('disconnected', accountId);
  }

  private handleNewMail(accountId: string, info: { path: string; count: number; prevCount: number }): void {
    const connInfo = this.connections.get(accountId);
    if (connInfo) {
      connInfo.lastActivity = Date.now();
    }

    const newCount = info.count - info.prevCount;
    if (newCount > 0) {
      this.emit('newMail', accountId, info.path, newCount);
    }
  }

  private handleFlagsUpdate(_accountId: string, _info: unknown): void {
    // Handle flag updates if needed
  }
}

// Singleton instance
export const imapConnectionPool = new ImapConnectionPool();
