import { z } from 'zod';

// IMAP account schema
export const accountSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  // IMAP settings
  imapHost: z.string().min(1),
  imapPort: z.number().int().min(1).max(65535),
  imapSecurity: z.enum(['tls', 'starttls', 'none']),
  // SMTP settings
  smtpHost: z.string().min(1),
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecurity: z.enum(['tls', 'starttls', 'none']),
  // Connection state
  isConnected: z.boolean(),
  lastSyncAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
  // Ordering
  sortOrder: z.number().int(),
  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Account = z.infer<typeof accountSchema>;

// Account creation input (credentials handled separately)
export const createAccountSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  // IMAP settings
  imapHost: z.string().min(1),
  imapPort: z.number().int().min(1).max(65535).default(993),
  imapSecurity: z.enum(['tls', 'starttls', 'none']).default('tls'),
  imapUsername: z.string().min(1),
  imapPassword: z.string().min(1),
  // SMTP settings
  smtpHost: z.string().min(1),
  smtpPort: z.number().int().min(1).max(65535).default(465),
  smtpSecurity: z.enum(['tls', 'starttls', 'none']).default('tls'),
  smtpUsername: z.string().min(1).optional(),
  smtpPassword: z.string().min(1).optional(),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;

// Account update
export const updateAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  // IMAP settings
  imapHost: z.string().min(1).optional(),
  imapPort: z.number().int().min(1).max(65535).optional(),
  imapSecurity: z.enum(['tls', 'starttls', 'none']).optional(),
  imapUsername: z.string().min(1).optional(),
  imapPassword: z.string().min(1).optional(),
  // SMTP settings
  smtpHost: z.string().min(1).optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpSecurity: z.enum(['tls', 'starttls', 'none']).optional(),
  smtpUsername: z.string().min(1).optional(),
  smtpPassword: z.string().min(1).optional(),
  // Ordering
  sortOrder: z.number().int().optional(),
});

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

// Account list item (without sensitive data)
export const accountListItemSchema = accountSchema.omit({
  userId: true,
});

export type AccountListItem = z.infer<typeof accountListItemSchema>;

// Common email provider presets
export const emailProviders = {
  gmail: {
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecurity: 'tls' as const,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecurity: 'tls' as const,
  },
  outlook: {
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecurity: 'tls' as const,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecurity: 'starttls' as const,
  },
  yahoo: {
    imapHost: 'imap.mail.yahoo.com',
    imapPort: 993,
    imapSecurity: 'tls' as const,
    smtpHost: 'smtp.mail.yahoo.com',
    smtpPort: 465,
    smtpSecurity: 'tls' as const,
  },
  icloud: {
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    imapSecurity: 'tls' as const,
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    smtpSecurity: 'starttls' as const,
  },
} as const;
