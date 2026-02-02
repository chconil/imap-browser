import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { eq, and, gt } from 'drizzle-orm';
import { getDatabase, users, sessions, settings, type User, type Session } from '../../db/index.js';
import { EncryptionService, credentialCache } from './encryption-service.js';
import type { CreateUserInput, LoginInput, UpdateUserInput } from '@imap-browser/shared';

// Argon2id configuration (OWASP recommendations)
const ARGON2_CONFIG: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
};

// Session configuration
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface AuthenticatedUser {
  user: Omit<User, 'passwordHash' | 'encryptionSalt'>;
  session: Session;
}

export class AuthService {
  /**
   * Register a new user
   */
  async register(input: CreateUserInput): Promise<AuthenticatedUser> {
    const db = getDatabase();

    // Check if email already exists
    const existing = await db.query.users.findFirst({
      where: eq(users.email, input.email.toLowerCase()),
    });

    if (existing) {
      throw new Error('Email already registered');
    }

    // Hash password
    const passwordHash = await argon2.hash(input.password, ARGON2_CONFIG);

    // Generate encryption salt for this user
    const encryptionSalt = EncryptionService.generateSalt();

    const now = new Date().toISOString();
    const userId = uuidv4();

    // Create user
    await db.insert(users).values({
      id: userId,
      email: input.email.toLowerCase(),
      displayName: input.displayName,
      passwordHash,
      encryptionSalt,
      role: 'user',
      createdAt: now,
      updatedAt: now,
    });

    // Create default settings
    await db.insert(settings).values({
      userId,
      updatedAt: now,
    });

    // Create session
    const session = await this.createSession(userId);

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new Error('Failed to create user');
    }

    return {
      user: this.sanitizeUser(user),
      session,
    };
  }

  /**
   * Login user with email and password
   */
  async login(input: LoginInput, userAgent?: string, ipAddress?: string): Promise<AuthenticatedUser> {
    const db = getDatabase();

    const user = await db.query.users.findFirst({
      where: eq(users.email, input.email.toLowerCase()),
    });

    if (!user) {
      // Prevent timing attacks by still doing password hash comparison
      await argon2.hash('dummy-password', ARGON2_CONFIG);
      throw new Error('Invalid email or password');
    }

    const validPassword = await argon2.verify(user.passwordHash, input.password);

    if (!validPassword) {
      throw new Error('Invalid email or password');
    }

    // Create session
    const session = await this.createSession(user.id, userAgent, ipAddress);

    return {
      user: this.sanitizeUser(user),
      session,
    };
  }

  /**
   * Logout user by invalidating session
   */
  async logout(sessionId: string): Promise<void> {
    const db = getDatabase();

    await db.delete(sessions).where(eq(sessions.id, sessionId));

    // Clear credential cache
    credentialCache.remove(sessionId);
  }

  /**
   * Validate session and return user
   */
  async validateSession(sessionId: string): Promise<AuthenticatedUser | null> {
    const db = getDatabase();
    const now = new Date().toISOString();

    const session = await db.query.sessions.findFirst({
      where: and(
        eq(sessions.id, sessionId),
        gt(sessions.expiresAt, now),
      ),
    });

    if (!session) {
      return null;
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });

    if (!user) {
      return null;
    }

    return {
      user: this.sanitizeUser(user),
      session,
    };
  }

  /**
   * Refresh session expiry
   */
  async refreshSession(sessionId: string): Promise<Session | null> {
    const db = getDatabase();
    const now = new Date().toISOString();

    const session = await db.query.sessions.findFirst({
      where: and(
        eq(sessions.id, sessionId),
        gt(sessions.expiresAt, now),
      ),
    });

    if (!session) {
      return null;
    }

    const newExpiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

    await db.update(sessions)
      .set({ expiresAt: newExpiresAt })
      .where(eq(sessions.id, sessionId));

    return { ...session, expiresAt: newExpiresAt };
  }

  /**
   * Update user profile
   */
  async updateUser(userId: string, input: UpdateUserInput): Promise<Omit<User, 'passwordHash' | 'encryptionSalt'>> {
    const db = getDatabase();

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new Error('User not found');
    }

    const updates: Partial<User> = {
      updatedAt: new Date().toISOString(),
    };

    if (input.displayName) {
      updates.displayName = input.displayName;
    }

    if (input.password) {
      updates.passwordHash = await argon2.hash(input.password, ARGON2_CONFIG);
    }

    await db.update(users)
      .set(updates)
      .where(eq(users.id, userId));

    const updatedUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!updatedUser) {
      throw new Error('Failed to update user');
    }

    return this.sanitizeUser(updatedUser);
  }

  /**
   * Get user by ID (internal use, includes sensitive fields)
   */
  async getUserById(userId: string): Promise<User | null> {
    const db = getDatabase();
    return db.query.users.findFirst({
      where: eq(users.id, userId),
    }) || null;
  }

  /**
   * Get user's encryption salt (needed for credential operations)
   */
  async getEncryptionSalt(userId: string): Promise<string | null> {
    const user = await this.getUserById(userId);
    return user?.encryptionSalt || null;
  }

  /**
   * Delete user and all associated data
   */
  async deleteUser(userId: string): Promise<void> {
    const db = getDatabase();

    // Cascade delete will handle related records
    await db.delete(users).where(eq(users.id, userId));
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const db = getDatabase();
    const now = new Date().toISOString();

    const result = await db.delete(sessions)
      .where(gt(now, sessions.expiresAt));

    return result.changes;
  }

  private async createSession(userId: string, userAgent?: string, ipAddress?: string): Promise<Session> {
    const db = getDatabase();

    const sessionId = EncryptionService.generateSessionToken();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

    await db.insert(sessions).values({
      id: sessionId,
      userId,
      expiresAt,
      createdAt: now,
      userAgent: userAgent || null,
      ipAddress: ipAddress || null,
    });

    return {
      id: sessionId,
      userId,
      expiresAt,
      createdAt: now,
      userAgent: userAgent || null,
      ipAddress: ipAddress || null,
    };
  }

  private sanitizeUser(user: User): Omit<User, 'passwordHash' | 'encryptionSalt'> {
    const { passwordHash: _, encryptionSalt: __, ...sanitized } = user;
    return sanitized;
  }
}

// Singleton instance
export const authService = new AuthService();
