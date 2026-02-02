import { z } from 'zod';
import { emailAddressSchema } from './email.js';

// Draft schema
export const draftSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  userId: z.string().uuid(),
  // Recipients
  to: z.array(emailAddressSchema),
  cc: z.array(emailAddressSchema),
  bcc: z.array(emailAddressSchema),
  // Content
  subject: z.string(),
  textBody: z.string(),
  htmlBody: z.string(),
  // Reply/forward reference
  inReplyTo: z.string().nullable(),
  references: z.array(z.string()),
  // Attachments (stored separately)
  attachmentIds: z.array(z.string()),
  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Draft = z.infer<typeof draftSchema>;

// Compose input
export const composeEmailSchema = z.object({
  accountId: z.string().uuid(),
  to: z.array(emailAddressSchema).min(1),
  cc: z.array(emailAddressSchema).default([]),
  bcc: z.array(emailAddressSchema).default([]),
  subject: z.string(),
  textBody: z.string().optional(),
  htmlBody: z.string().optional(),
  // Reply/forward reference
  inReplyTo: z.string().nullable().optional(),
  references: z.array(z.string()).default([]),
  // Attachment IDs (uploaded separately)
  attachmentIds: z.array(z.string()).default([]),
});

export type ComposeEmailInput = z.infer<typeof composeEmailSchema>;

// Save draft input
export const saveDraftSchema = z.object({
  id: z.string().uuid().optional(), // If updating existing draft
  accountId: z.string().uuid(),
  to: z.array(emailAddressSchema).default([]),
  cc: z.array(emailAddressSchema).default([]),
  bcc: z.array(emailAddressSchema).default([]),
  subject: z.string().default(''),
  textBody: z.string().default(''),
  htmlBody: z.string().default(''),
  inReplyTo: z.string().nullable().optional(),
  references: z.array(z.string()).default([]),
  attachmentIds: z.array(z.string()).default([]),
});

export type SaveDraftInput = z.infer<typeof saveDraftSchema>;

// Compose mode
export const ComposeMode = {
  NEW: 'new',
  REPLY: 'reply',
  REPLY_ALL: 'reply-all',
  FORWARD: 'forward',
  EDIT_DRAFT: 'edit-draft',
} as const;

export type ComposeMode = (typeof ComposeMode)[keyof typeof ComposeMode];

// Attachment upload response
export const attachmentUploadResponseSchema = z.object({
  id: z.string(),
  filename: z.string(),
  contentType: z.string(),
  size: z.number().int(),
});

export type AttachmentUploadResponse = z.infer<typeof attachmentUploadResponseSchema>;

// Send email response
export const sendEmailResponseSchema = z.object({
  success: z.boolean(),
  messageId: z.string().optional(),
  error: z.string().optional(),
});

export type SendEmailResponse = z.infer<typeof sendEmailResponseSchema>;
