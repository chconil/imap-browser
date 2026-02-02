import { z } from 'zod';

// Email address schema
export const emailAddressSchema = z.object({
  name: z.string().optional(),
  address: z.string().email(),
});

export type EmailAddress = z.infer<typeof emailAddressSchema>;

// Email flags
export const EmailFlag = {
  SEEN: '\\Seen',
  ANSWERED: '\\Answered',
  FLAGGED: '\\Flagged',
  DELETED: '\\Deleted',
  DRAFT: '\\Draft',
} as const;

export type EmailFlag = (typeof EmailFlag)[keyof typeof EmailFlag];

// Email header (for list view)
export const emailHeaderSchema = z.object({
  id: z.string(),
  accountId: z.string().uuid(),
  folderId: z.string(),
  uid: z.number().int(),
  messageId: z.string().nullable(),
  subject: z.string(),
  from: z.array(emailAddressSchema),
  to: z.array(emailAddressSchema),
  cc: z.array(emailAddressSchema),
  bcc: z.array(emailAddressSchema),
  replyTo: z.array(emailAddressSchema),
  date: z.string().datetime(),
  receivedAt: z.string().datetime(),
  flags: z.array(z.string()),
  size: z.number().int(),
  hasAttachments: z.boolean(),
  previewText: z.string(),
  threadId: z.string().nullable(),
});

export type EmailHeader = z.infer<typeof emailHeaderSchema>;

// Attachment metadata
export const attachmentSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  filename: z.string(),
  contentType: z.string(),
  size: z.number().int(),
  contentId: z.string().nullable(),
  disposition: z.enum(['attachment', 'inline']),
  partId: z.string(),
});

export type Attachment = z.infer<typeof attachmentSchema>;

// Full email with body
export const emailSchema = emailHeaderSchema.extend({
  textBody: z.string().nullable(),
  htmlBody: z.string().nullable(),
  attachments: z.array(attachmentSchema),
  rawHeaders: z.record(z.string()).optional(),
});

export type Email = z.infer<typeof emailSchema>;

// Email list query params
export const emailListQuerySchema = z.object({
  accountId: z.string().uuid(),
  folderId: z.string(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
  sortBy: z.enum(['date', 'from', 'subject', 'size']).default('date'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type EmailListQuery = z.infer<typeof emailListQuerySchema>;

// Email list response
export const emailListResponseSchema = z.object({
  emails: z.array(emailHeaderSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  hasMore: z.boolean(),
});

export type EmailListResponse = z.infer<typeof emailListResponseSchema>;

// Flag update
export const flagUpdateSchema = z.object({
  emailIds: z.array(z.string()).min(1),
  addFlags: z.array(z.string()).optional(),
  removeFlags: z.array(z.string()).optional(),
});

export type FlagUpdateInput = z.infer<typeof flagUpdateSchema>;

// Move emails
export const moveEmailsSchema = z.object({
  emailIds: z.array(z.string()).min(1),
  targetFolderId: z.string(),
});

export type MoveEmailsInput = z.infer<typeof moveEmailsSchema>;

// Delete emails
export const deleteEmailsSchema = z.object({
  emailIds: z.array(z.string()).min(1),
  permanent: z.boolean().default(false),
});

export type DeleteEmailsInput = z.infer<typeof deleteEmailsSchema>;

// Search query
export const searchQuerySchema = z.object({
  accountId: z.string().uuid().optional(),
  query: z.string().min(1),
  folderId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  subject: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  hasAttachments: z.boolean().optional(),
  isUnread: z.boolean().optional(),
  isFlagged: z.boolean().optional(),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
