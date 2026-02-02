import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { eq, and } from 'drizzle-orm';
import { getDatabase, accounts, draftAttachments } from '../../db/index.js';
import { EncryptionService } from '../auth/encryption-service.js';
import type { ComposeEmailInput, SendEmailResponse } from '@imap-browser/shared';

interface TransporterInfo {
  transporter: Transporter;
  accountId: string;
  lastUsed: number;
}

export class SmtpService {
  private transporters = new Map<string, TransporterInfo>();

  /**
   * Send an email
   */
  async sendEmail(
    userId: string,
    input: ComposeEmailInput,
    userPassword: string,
    userSalt: string,
  ): Promise<SendEmailResponse> {
    const db = getDatabase();

    // Verify user owns this account
    const account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.id, input.accountId),
        eq(accounts.userId, userId),
      ),
    });

    if (!account) {
      return { success: false, error: 'Account not found' };
    }

    try {
      const transporter = await this.getTransporter(account.id, userPassword, userSalt);

      // Build email options
      const mailOptions: nodemailer.SendMailOptions = {
        from: {
          name: account.name,
          address: account.email,
        },
        to: input.to.map(addr => ({
          name: addr.name || '',
          address: addr.address,
        })),
        cc: input.cc?.map(addr => ({
          name: addr.name || '',
          address: addr.address,
        })),
        bcc: input.bcc?.map(addr => ({
          name: addr.name || '',
          address: addr.address,
        })),
        subject: input.subject,
        text: input.textBody,
        html: input.htmlBody,
        inReplyTo: input.inReplyTo || undefined,
        references: input.references?.join(' '),
        attachments: [],
      };

      // Add attachments
      if (input.attachmentIds?.length) {
        const attachmentRows = await db.query.draftAttachments.findMany({
          where: and(
            eq(draftAttachments.userId, userId),
          ),
        });

        const attachmentMap = new Map(attachmentRows.map(a => [a.id, a]));

        for (const attachmentId of input.attachmentIds) {
          const attachment = attachmentMap.get(attachmentId);
          if (attachment) {
            mailOptions.attachments!.push({
              filename: attachment.filename,
              content: attachment.data,
              contentType: attachment.contentType,
            });
          }
        }
      }

      // Send email
      const info = await transporter.sendMail(mailOptions);

      // Clean up used attachments
      if (input.attachmentIds?.length) {
        for (const attachmentId of input.attachmentIds) {
          await db.delete(draftAttachments)
            .where(and(
              eq(draftAttachments.id, attachmentId),
              eq(draftAttachments.userId, userId),
            ));
        }
      }

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Test SMTP connection
   */
  async testConnection(
    host: string,
    port: number,
    security: 'tls' | 'starttls' | 'none',
    username: string,
    password: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const transporter = this.createTransporter(host, port, security, username, password);
      await transporter.verify();
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Close all transporters
   */
  closeAll(): void {
    for (const info of this.transporters.values()) {
      info.transporter.close();
    }
    this.transporters.clear();
  }

  private async getTransporter(
    accountId: string,
    userPassword: string,
    userSalt: string,
  ): Promise<Transporter> {
    const existing = this.transporters.get(accountId);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing.transporter;
    }

    const db = getDatabase();
    const account = await db.query.accounts.findFirst({
      where: eq(accounts.id, accountId),
    });

    if (!account) {
      throw new Error('Account not found');
    }

    // Decrypt credentials
    const key = await EncryptionService.deriveKey(userPassword, userSalt);
    const smtpUsername = EncryptionService.decrypt(account.smtpUsername, account.smtpIv, key);
    const smtpPassword = EncryptionService.decrypt(account.smtpPassword, account.smtpIv, key);

    const transporter = this.createTransporter(
      account.smtpHost,
      account.smtpPort,
      account.smtpSecurity,
      smtpUsername,
      smtpPassword,
    );

    this.transporters.set(accountId, {
      transporter,
      accountId,
      lastUsed: Date.now(),
    });

    return transporter;
  }

  private createTransporter(
    host: string,
    port: number,
    security: 'tls' | 'starttls' | 'none',
    username: string,
    password: string,
  ): Transporter {
    const options: nodemailer.TransportOptions = {
      host,
      port,
      secure: security === 'tls',
      auth: {
        user: username,
        pass: password,
      },
      tls: security !== 'none' ? {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
      } : undefined,
    } as nodemailer.TransportOptions;

    return nodemailer.createTransport(options);
  }
}

// Singleton instance
export const smtpService = new SmtpService();
