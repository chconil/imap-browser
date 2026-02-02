import { create } from 'zustand';
import type { EmailHeader } from '@imap-browser/shared';

interface MailState {
  // Selected items
  selectedAccountId: string | null;
  selectedFolderId: string | null;
  selectedEmailId: string | null;
  selectedEmailIds: Set<string>;

  // UI state
  isSidebarCollapsed: boolean;
  isComposeOpen: boolean;
  composeMode: 'new' | 'reply' | 'reply-all' | 'forward' | null;
  replyToEmail: EmailHeader | null;

  // Search
  searchQuery: string;
  isSearching: boolean;

  // Actions
  setSelectedAccount: (accountId: string | null) => void;
  setSelectedFolder: (folderId: string | null) => void;
  setSelectedEmail: (emailId: string | null) => void;
  toggleEmailSelection: (emailId: string) => void;
  selectAllEmails: (emailIds: string[]) => void;
  clearEmailSelection: () => void;
  toggleSidebar: () => void;
  openCompose: (mode?: 'new' | 'reply' | 'reply-all' | 'forward', replyTo?: EmailHeader) => void;
  closeCompose: () => void;
  setSearchQuery: (query: string) => void;
  setIsSearching: (isSearching: boolean) => void;
}

export const useMailStore = create<MailState>((set) => ({
  // Initial state
  selectedAccountId: null,
  selectedFolderId: null,
  selectedEmailId: null,
  selectedEmailIds: new Set(),
  isSidebarCollapsed: false,
  isComposeOpen: false,
  composeMode: null,
  replyToEmail: null,
  searchQuery: '',
  isSearching: false,

  // Actions
  setSelectedAccount: (accountId) =>
    set({
      selectedAccountId: accountId,
      selectedFolderId: null,
      selectedEmailId: null,
      selectedEmailIds: new Set(),
    }),

  setSelectedFolder: (folderId) =>
    set({
      selectedFolderId: folderId,
      selectedEmailId: null,
      selectedEmailIds: new Set(),
    }),

  setSelectedEmail: (emailId) =>
    set({ selectedEmailId: emailId }),

  toggleEmailSelection: (emailId) =>
    set((state) => {
      const newSet = new Set(state.selectedEmailIds);
      if (newSet.has(emailId)) {
        newSet.delete(emailId);
      } else {
        newSet.add(emailId);
      }
      return { selectedEmailIds: newSet };
    }),

  selectAllEmails: (emailIds) =>
    set({ selectedEmailIds: new Set(emailIds) }),

  clearEmailSelection: () =>
    set({ selectedEmailIds: new Set() }),

  toggleSidebar: () =>
    set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

  openCompose: (mode = 'new', replyTo) =>
    set({
      isComposeOpen: true,
      composeMode: mode,
      replyToEmail: replyTo ?? null,
    }),

  closeCompose: () =>
    set({
      isComposeOpen: false,
      composeMode: null,
      replyToEmail: null,
    }),

  setSearchQuery: (query) =>
    set({ searchQuery: query }),

  setIsSearching: (isSearching) =>
    set({ isSearching }),
}));
