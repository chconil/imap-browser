import { sqliteTable, text, integer, blob, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Users table
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['user', 'admin'] }).notNull().default('user'),
  encryptionSalt: text('encryption_salt').notNull(), // For deriving per-user encryption key
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  emailIdx: uniqueIndex('users_email_idx').on(table.email),
}));

// Sessions table
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
}, (table) => ({
  userIdIdx: index('sessions_user_id_idx').on(table.userId),
  expiresAtIdx: index('sessions_expires_at_idx').on(table.expiresAt),
}));

// IMAP accounts table
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email').notNull(),
  // IMAP settings
  imapHost: text('imap_host').notNull(),
  imapPort: integer('imap_port').notNull(),
  imapSecurity: text('imap_security', { enum: ['tls', 'starttls', 'none'] }).notNull(),
  // Encrypted IMAP credentials (AES-256-GCM)
  imapUsername: blob('imap_username', { mode: 'buffer' }).notNull(),
  imapPassword: blob('imap_password', { mode: 'buffer' }).notNull(),
  imapIv: text('imap_iv').notNull(), // Base64 encoded IV for username
  imapPasswordIv: text('imap_password_iv').notNull(), // Base64 encoded IV for password
  // SMTP settings
  smtpHost: text('smtp_host').notNull(),
  smtpPort: integer('smtp_port').notNull(),
  smtpSecurity: text('smtp_security', { enum: ['tls', 'starttls', 'none'] }).notNull(),
  // Encrypted SMTP credentials (may be same as IMAP)
  smtpUsername: blob('smtp_username', { mode: 'buffer' }).notNull(),
  smtpPassword: blob('smtp_password', { mode: 'buffer' }).notNull(),
  smtpIv: text('smtp_iv').notNull(), // Base64 encoded IV for username
  smtpPasswordIv: text('smtp_password_iv').notNull(), // Base64 encoded IV for password
  // Connection state
  isConnected: integer('is_connected', { mode: 'boolean' }).notNull().default(false),
  lastSyncAt: text('last_sync_at'),
  lastError: text('last_error'),
  // Ordering
  sortOrder: integer('sort_order').notNull().default(0),
  // Timestamps
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  userIdIdx: index('accounts_user_id_idx').on(table.userId),
  userIdSortOrderIdx: index('accounts_user_id_sort_order_idx').on(table.userId, table.sortOrder),
}));

// Folders table
export const folders = sqliteTable('folders', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  path: text('path').notNull(),
  delimiter: text('delimiter').notNull(),
  parentPath: text('parent_path'),
  specialUse: text('special_use'), // \\Inbox, \\Sent, \\Drafts, \\Trash, \\Spam, etc.
  // Counts
  totalMessages: integer('total_messages').notNull().default(0),
  unreadMessages: integer('unread_messages').notNull().default(0),
  // IMAP state for sync
  uidValidity: integer('uid_validity'),
  uidNext: integer('uid_next'),
  highestModSeq: text('highest_mod_seq'),
  // Flags
  isSubscribed: integer('is_subscribed', { mode: 'boolean' }).notNull().default(true),
  isSelectable: integer('is_selectable', { mode: 'boolean' }).notNull().default(true),
  hasChildren: integer('has_children', { mode: 'boolean' }).notNull().default(false),
  // Timestamps
  lastSyncAt: text('last_sync_at'),
}, (table) => ({
  accountIdIdx: index('folders_account_id_idx').on(table.accountId),
  accountPathIdx: uniqueIndex('folders_account_path_idx').on(table.accountId, table.path),
}));

// Messages (headers) table
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  folderId: text('folder_id').notNull().references(() => folders.id, { onDelete: 'cascade' }),
  uid: integer('uid').notNull(),
  messageId: text('message_id'), // Message-ID header
  // Envelope
  subject: text('subject').notNull(),
  fromJson: text('from_json').notNull(), // JSON array of {name, address}
  toJson: text('to_json').notNull(),
  ccJson: text('cc_json').notNull(),
  bccJson: text('bcc_json').notNull(),
  replyToJson: text('reply_to_json').notNull(),
  // Dates
  date: text('date').notNull(), // Message Date header
  receivedAt: text('received_at').notNull(), // When fetched/received
  // Flags
  flagsJson: text('flags_json').notNull(), // JSON array of flags
  // Size and preview
  size: integer('size').notNull(),
  hasAttachments: integer('has_attachments', { mode: 'boolean' }).notNull().default(false),
  previewText: text('preview_text').notNull(),
  // Threading
  threadId: text('thread_id'),
  inReplyTo: text('in_reply_to'),
  referencesJson: text('references_json'), // JSON array
}, (table) => ({
  accountIdIdx: index('messages_account_id_idx').on(table.accountId),
  folderIdIdx: index('messages_folder_id_idx').on(table.folderId),
  folderUidIdx: uniqueIndex('messages_folder_uid_idx').on(table.folderId, table.uid),
  dateIdx: index('messages_date_idx').on(table.date),
  messageIdIdx: index('messages_message_id_idx').on(table.messageId),
  threadIdIdx: index('messages_thread_id_idx').on(table.threadId),
}));

// Message bodies table (lazy loaded)
export const messageBodies = sqliteTable('message_bodies', {
  id: text('id').primaryKey(),
  messageId: text('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }).unique(),
  textBody: text('text_body'),
  htmlBody: text('html_body'),
  rawHeadersJson: text('raw_headers_json'), // JSON object
  fetchedAt: text('fetched_at').notNull(),
}, (table) => ({
  messageIdIdx: uniqueIndex('message_bodies_message_id_idx').on(table.messageId),
}));

// Attachments table
export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  messageId: text('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  contentId: text('content_id'), // For inline images
  disposition: text('disposition', { enum: ['attachment', 'inline'] }).notNull().default('attachment'),
  partId: text('part_id').notNull(), // IMAP part identifier for streaming
}, (table) => ({
  messageIdIdx: index('attachments_message_id_idx').on(table.messageId),
}));

// Drafts table (local unsent messages)
export const drafts = sqliteTable('drafts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Recipients
  toJson: text('to_json').notNull(),
  ccJson: text('cc_json').notNull(),
  bccJson: text('bcc_json').notNull(),
  // Content
  subject: text('subject').notNull(),
  textBody: text('text_body').notNull(),
  htmlBody: text('html_body').notNull(),
  // Reply/forward reference
  inReplyTo: text('in_reply_to'),
  referencesJson: text('references_json'),
  // Attachments (stored separately)
  attachmentIdsJson: text('attachment_ids_json').notNull(),
  // Timestamps
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  accountIdIdx: index('drafts_account_id_idx').on(table.accountId),
  userIdIdx: index('drafts_user_id_idx').on(table.userId),
}));

// Draft attachments (temporary storage)
export const draftAttachments = sqliteTable('draft_attachments', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  data: blob('data', { mode: 'buffer' }).notNull(), // Stored in DB for simplicity
  createdAt: text('created_at').notNull(),
}, (table) => ({
  userIdIdx: index('draft_attachments_user_id_idx').on(table.userId),
}));

// User settings table
export const settings = sqliteTable('settings', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  // Display
  theme: text('theme', { enum: ['light', 'dark', 'system'] }).notNull().default('system'),
  navigationMode: text('navigation_mode', { enum: ['dropdown', 'tree'] }).notNull().default('dropdown'),
  emailsPerPage: integer('emails_per_page').notNull().default(50),
  previewLines: integer('preview_lines').notNull().default(2),
  // Compose
  defaultSignature: text('default_signature').notNull().default(''),
  replyQuotePosition: text('reply_quote_position', { enum: ['top', 'bottom'] }).notNull().default('top'),
  // Notifications
  enableDesktopNotifications: integer('enable_desktop_notifications', { mode: 'boolean' }).notNull().default(true),
  enableSoundNotifications: integer('enable_sound_notifications', { mode: 'boolean' }).notNull().default(false),
  // Sync
  autoSyncInterval: integer('auto_sync_interval').notNull().default(5),
  // Security
  autoLockTimeout: integer('auto_lock_timeout').notNull().default(15),
  // Timestamps
  updatedAt: text('updated_at').notNull(),
});

// Types for TypeScript
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type MessageBody = typeof messageBodies.$inferSelect;
export type NewMessageBody = typeof messageBodies.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
export type Draft = typeof drafts.$inferSelect;
export type NewDraft = typeof drafts.$inferInsert;
export type DraftAttachment = typeof draftAttachments.$inferSelect;
export type NewDraftAttachment = typeof draftAttachments.$inferInsert;
export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;
