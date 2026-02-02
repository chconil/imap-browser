import { randomBytes, createCipheriv, createDecipheriv, scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

// AES-256-GCM configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits
const SALT_LENGTH = 32;

export interface EncryptedData {
  ciphertext: Buffer;
  iv: string; // Base64 encoded
  authTag: Buffer;
}

export class EncryptionService {
  /**
   * Generate a random salt for key derivation
   */
  static generateSalt(): string {
    return randomBytes(SALT_LENGTH).toString('base64');
  }

  /**
   * Derive an encryption key from a user's password and salt
   * This is used for encrypting IMAP/SMTP credentials
   */
  static async deriveKey(password: string, salt: string): Promise<Buffer> {
    const saltBuffer = Buffer.from(salt, 'base64');
    const key = await scryptAsync(password, saltBuffer, KEY_LENGTH) as Buffer;
    return key;
  }

  /**
   * Encrypt plaintext using AES-256-GCM
   */
  static encrypt(plaintext: string, key: Buffer): EncryptedData {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return {
      ciphertext: Buffer.concat([ciphertext, authTag]),
      iv: iv.toString('base64'),
      authTag,
    };
  }

  /**
   * Decrypt ciphertext using AES-256-GCM
   */
  static decrypt(encryptedData: Buffer, iv: string, key: Buffer): string {
    const ivBuffer = Buffer.from(iv, 'base64');

    // Extract auth tag from the end of ciphertext
    const authTag = encryptedData.subarray(encryptedData.length - AUTH_TAG_LENGTH);
    const ciphertext = encryptedData.subarray(0, encryptedData.length - AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, ivBuffer, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  }

  /**
   * Encrypt credentials for storage in database
   */
  static async encryptCredential(credential: string, userPassword: string, userSalt: string): Promise<{ encrypted: Buffer; iv: string }> {
    const key = await this.deriveKey(userPassword, userSalt);
    const { ciphertext, iv } = this.encrypt(credential, key);
    return { encrypted: ciphertext, iv };
  }

  /**
   * Decrypt credentials from database
   */
  static async decryptCredential(encrypted: Buffer, iv: string, userPassword: string, userSalt: string): Promise<string> {
    const key = await this.deriveKey(userPassword, userSalt);
    return this.decrypt(encrypted, iv, key);
  }

  /**
   * Generate a secure session token
   */
  static generateSessionToken(): string {
    return randomBytes(32).toString('base64url');
  }
}

/**
 * In-memory credential cache for active sessions
 * Stores derived encryption keys to avoid re-deriving from password
 * Keys are cleared on logout or session expiry
 */
export class CredentialCache {
  private cache = new Map<string, { key: Buffer; expiresAt: number }>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly ttlMs: number = 15 * 60 * 1000) { // 15 minutes default
    this.startCleanup();
  }

  private startCleanup(): void {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [sessionId, entry] of this.cache) {
        if (entry.expiresAt < now) {
          this.cache.delete(sessionId);
        }
      }
    }, 60 * 1000);
  }

  async getOrDerive(
    sessionId: string,
    password: string,
    salt: string,
  ): Promise<Buffer> {
    const existing = this.cache.get(sessionId);
    if (existing && existing.expiresAt > Date.now()) {
      // Refresh expiry on access
      existing.expiresAt = Date.now() + this.ttlMs;
      return existing.key;
    }

    const key = await EncryptionService.deriveKey(password, salt);
    this.cache.set(sessionId, {
      key,
      expiresAt: Date.now() + this.ttlMs,
    });

    return key;
  }

  remove(sessionId: string): void {
    this.cache.delete(sessionId);
  }

  clear(): void {
    this.cache.clear();
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

// Singleton instance
export const credentialCache = new CredentialCache();
