import { z } from 'zod';

// Theme options
export const Theme = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
} as const;

export type Theme = (typeof Theme)[keyof typeof Theme];

// Navigation mode
export const NavigationMode = {
  DROPDOWN: 'dropdown',
  TREE: 'tree',
} as const;

export type NavigationMode = (typeof NavigationMode)[keyof typeof NavigationMode];

// User settings schema
export const userSettingsSchema = z.object({
  userId: z.string().uuid(),
  // Display
  theme: z.enum([Theme.LIGHT, Theme.DARK, Theme.SYSTEM]).default(Theme.SYSTEM),
  navigationMode: z.enum([NavigationMode.DROPDOWN, NavigationMode.TREE]).default(NavigationMode.DROPDOWN),
  emailsPerPage: z.number().int().min(10).max(100).default(50),
  previewLines: z.number().int().min(0).max(5).default(2),
  // Compose
  defaultSignature: z.string().default(''),
  replyQuotePosition: z.enum(['top', 'bottom']).default('top'),
  // Notifications
  enableDesktopNotifications: z.boolean().default(true),
  enableSoundNotifications: z.boolean().default(false),
  // Sync
  autoSyncInterval: z.number().int().min(0).max(60).default(5), // 0 = manual only
  // Security
  autoLockTimeout: z.number().int().min(0).max(120).default(15), // 0 = never
  // Timestamps
  updatedAt: z.string().datetime(),
});

export type UserSettings = z.infer<typeof userSettingsSchema>;

// Update settings input
export const updateSettingsSchema = userSettingsSchema.omit({
  userId: true,
  updatedAt: true,
}).partial();

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

// Keyboard shortcut
export const keyboardShortcutSchema = z.object({
  action: z.string(),
  key: z.string(),
  modifiers: z.array(z.enum(['ctrl', 'alt', 'shift', 'meta'])).default([]),
  description: z.string(),
});

export type KeyboardShortcut = z.infer<typeof keyboardShortcutSchema>;

// Default keyboard shortcuts
export const defaultKeyboardShortcuts: KeyboardShortcut[] = [
  { action: 'compose', key: 'c', modifiers: [], description: 'Compose new email' },
  { action: 'reply', key: 'r', modifiers: [], description: 'Reply to email' },
  { action: 'replyAll', key: 'a', modifiers: [], description: 'Reply all' },
  { action: 'forward', key: 'f', modifiers: [], description: 'Forward email' },
  { action: 'delete', key: 'd', modifiers: [], description: 'Delete email' },
  { action: 'archive', key: 'e', modifiers: [], description: 'Archive email' },
  { action: 'markRead', key: 'i', modifiers: ['shift'], description: 'Mark as read' },
  { action: 'markUnread', key: 'u', modifiers: ['shift'], description: 'Mark as unread' },
  { action: 'star', key: 's', modifiers: [], description: 'Star/flag email' },
  { action: 'search', key: '/', modifiers: [], description: 'Focus search' },
  { action: 'nextEmail', key: 'j', modifiers: [], description: 'Next email' },
  { action: 'prevEmail', key: 'k', modifiers: [], description: 'Previous email' },
  { action: 'openEmail', key: 'o', modifiers: [], description: 'Open email' },
  { action: 'goToInbox', key: 'g', modifiers: [], description: 'Go to inbox' },
  { action: 'selectAll', key: 'a', modifiers: ['ctrl'], description: 'Select all' },
  { action: 'escape', key: 'Escape', modifiers: [], description: 'Close/cancel' },
  { action: 'send', key: 'Enter', modifiers: ['ctrl'], description: 'Send email' },
];
