import { z } from 'zod';

// Server settings for IMAP or SMTP
export const serverSettingsSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  security: z.enum(['tls', 'starttls', 'none']),
});

export type ServerSettings = z.infer<typeof serverSettingsSchema>;

// Autoconfig lookup result
export const autoconfigResultSchema = z.object({
  found: z.boolean(),
  provider: z.string().optional(),
  imap: serverSettingsSchema.optional(),
  smtp: serverSettingsSchema.optional(),
  source: z.enum(['preset', 'srv', 'autoconfig', 'ispdb', 'mx']).optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
});

export type AutoconfigResult = z.infer<typeof autoconfigResultSchema>;

// Lookup input
export const autoconfigLookupInputSchema = z.object({
  email: z.string().email(),
});

export type AutoconfigLookupInput = z.infer<typeof autoconfigLookupInputSchema>;
