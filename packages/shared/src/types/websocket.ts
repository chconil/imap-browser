import { z } from 'zod';
import { emailHeaderSchema } from './email.js';
import { folderSchema } from './folder.js';

// WebSocket event types
export const WebSocketEvent = {
  // Connection
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  ERROR: 'error',
  // Email events
  NEW_EMAIL: 'new_email',
  EMAIL_UPDATED: 'email_updated',
  EMAIL_DELETED: 'email_deleted',
  EMAIL_MOVED: 'email_moved',
  // Folder events
  FOLDER_UPDATED: 'folder_updated',
  FOLDER_CREATED: 'folder_created',
  FOLDER_DELETED: 'folder_deleted',
  // Account events
  ACCOUNT_CONNECTED: 'account_connected',
  ACCOUNT_DISCONNECTED: 'account_disconnected',
  ACCOUNT_ERROR: 'account_error',
  SYNC_STARTED: 'sync_started',
  SYNC_COMPLETED: 'sync_completed',
  SYNC_ERROR: 'sync_error',
} as const;

export type WebSocketEvent = (typeof WebSocketEvent)[keyof typeof WebSocketEvent];

// Event payloads
export const newEmailEventSchema = z.object({
  type: z.literal(WebSocketEvent.NEW_EMAIL),
  accountId: z.string().uuid(),
  folderId: z.string(),
  email: emailHeaderSchema,
});

export type NewEmailEvent = z.infer<typeof newEmailEventSchema>;

export const emailUpdatedEventSchema = z.object({
  type: z.literal(WebSocketEvent.EMAIL_UPDATED),
  accountId: z.string().uuid(),
  emailId: z.string(),
  changes: z.object({
    flags: z.array(z.string()).optional(),
    folderId: z.string().optional(),
  }),
});

export type EmailUpdatedEvent = z.infer<typeof emailUpdatedEventSchema>;

export const emailDeletedEventSchema = z.object({
  type: z.literal(WebSocketEvent.EMAIL_DELETED),
  accountId: z.string().uuid(),
  emailIds: z.array(z.string()),
});

export type EmailDeletedEvent = z.infer<typeof emailDeletedEventSchema>;

export const folderUpdatedEventSchema = z.object({
  type: z.literal(WebSocketEvent.FOLDER_UPDATED),
  accountId: z.string().uuid(),
  folder: folderSchema,
});

export type FolderUpdatedEvent = z.infer<typeof folderUpdatedEventSchema>;

export const accountConnectedEventSchema = z.object({
  type: z.literal(WebSocketEvent.ACCOUNT_CONNECTED),
  accountId: z.string().uuid(),
});

export type AccountConnectedEvent = z.infer<typeof accountConnectedEventSchema>;

export const accountDisconnectedEventSchema = z.object({
  type: z.literal(WebSocketEvent.ACCOUNT_DISCONNECTED),
  accountId: z.string().uuid(),
  reason: z.string().optional(),
});

export type AccountDisconnectedEvent = z.infer<typeof accountDisconnectedEventSchema>;

export const accountErrorEventSchema = z.object({
  type: z.literal(WebSocketEvent.ACCOUNT_ERROR),
  accountId: z.string().uuid(),
  error: z.string(),
});

export type AccountErrorEvent = z.infer<typeof accountErrorEventSchema>;

export const syncEventSchema = z.object({
  type: z.enum([WebSocketEvent.SYNC_STARTED, WebSocketEvent.SYNC_COMPLETED, WebSocketEvent.SYNC_ERROR]),
  accountId: z.string().uuid(),
  folderId: z.string().optional(),
  error: z.string().optional(),
  newMessages: z.number().int().optional(),
});

export type SyncEvent = z.infer<typeof syncEventSchema>;

// Union of all event types
export type WebSocketEventPayload =
  | NewEmailEvent
  | EmailUpdatedEvent
  | EmailDeletedEvent
  | FolderUpdatedEvent
  | AccountConnectedEvent
  | AccountDisconnectedEvent
  | AccountErrorEvent
  | SyncEvent;
