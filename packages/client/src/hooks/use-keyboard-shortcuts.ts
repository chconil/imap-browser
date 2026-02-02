import { useEffect, useCallback } from 'react';
import { useMailStore } from '@/stores/mail-store';
import { useUpdateFlags, useDeleteEmails } from './use-emails';
import { defaultKeyboardShortcuts } from '@imap-browser/shared';

export function useKeyboardShortcuts() {
  const {
    selectedAccountId,
    selectedEmailId,
    selectedEmailIds,
    openCompose,
    setSelectedEmail,
  } = useMailStore();

  const updateFlags = useUpdateFlags();
  const deleteEmails = useDeleteEmails();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't handle shortcuts when typing in inputs
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return;
    }

    const shortcut = defaultKeyboardShortcuts.find((s) => {
      const keyMatch = s.key.toLowerCase() === e.key.toLowerCase();
      const ctrlMatch = s.modifiers.includes('ctrl') === (e.ctrlKey || e.metaKey);
      const shiftMatch = s.modifiers.includes('shift') === e.shiftKey;
      const altMatch = s.modifiers.includes('alt') === e.altKey;
      return keyMatch && ctrlMatch && shiftMatch && altMatch;
    });

    if (!shortcut) return;

    e.preventDefault();

    const emailIds = selectedEmailId
      ? [selectedEmailId]
      : Array.from(selectedEmailIds);

    switch (shortcut.action) {
      case 'compose':
        openCompose('new');
        break;

      case 'reply':
        if (selectedEmailId) {
          openCompose('reply');
        }
        break;

      case 'replyAll':
        if (selectedEmailId) {
          openCompose('reply-all');
        }
        break;

      case 'forward':
        if (selectedEmailId) {
          openCompose('forward');
        }
        break;

      case 'delete':
        if (selectedAccountId && emailIds.length > 0) {
          deleteEmails.mutate({
            accountId: selectedAccountId,
            emailIds,
          });
        }
        break;

      case 'markRead':
        if (selectedAccountId && emailIds.length > 0) {
          updateFlags.mutate({
            accountId: selectedAccountId,
            emailIds,
            addFlags: ['\\Seen'],
          });
        }
        break;

      case 'markUnread':
        if (selectedAccountId && emailIds.length > 0) {
          updateFlags.mutate({
            accountId: selectedAccountId,
            emailIds,
            removeFlags: ['\\Seen'],
          });
        }
        break;

      case 'star':
        if (selectedAccountId && emailIds.length > 0) {
          updateFlags.mutate({
            accountId: selectedAccountId,
            emailIds,
            addFlags: ['\\Flagged'],
          });
        }
        break;

      case 'escape':
        setSelectedEmail(null);
        break;
    }
  }, [
    selectedAccountId,
    selectedEmailId,
    selectedEmailIds,
    openCompose,
    setSelectedEmail,
    updateFlags,
    deleteEmails,
  ]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
