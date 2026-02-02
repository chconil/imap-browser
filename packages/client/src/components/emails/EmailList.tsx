import { useRef, useCallback, useMemo, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMailStore } from '@/stores/mail-store';
import { useInfiniteEmails, useUpdateFlags, useSyncFolder } from '@/hooks/use-emails';
import { cn, formatDate, truncate } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Star, Paperclip, RefreshCw } from 'lucide-react';
import type { EmailHeader } from '@imap-browser/shared';

function EmailRow({
  email,
  isSelected,
  isChecked,
  onSelect,
  onToggleCheck,
  onToggleStar,
}: {
  email: EmailHeader;
  isSelected: boolean;
  isChecked: boolean;
  onSelect: () => void;
  onToggleCheck: () => void;
  onToggleStar: () => void;
}) {
  const isRead = email.flags.includes('\\Seen');
  const isStarred = email.flags.includes('\\Flagged');
  const fromName = email.from[0]?.name || email.from[0]?.address || 'Unknown';

  return (
    <div
      onClick={onSelect}
      className={cn(
        'flex items-center gap-3 px-4 py-3 border-b cursor-pointer hover:bg-accent/50 transition-colors',
        isSelected && 'bg-accent',
        !isRead && 'bg-primary/5',
      )}
    >
      {/* Checkbox */}
      <Checkbox
        checked={isChecked}
        onCheckedChange={onToggleCheck}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Star */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleStar();
        }}
        className="p-1 hover:bg-muted rounded"
      >
        <Star
          className={cn(
            'h-4 w-4',
            isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground',
          )}
        />
      </button>

      {/* From */}
      <div className={cn('w-48 truncate', !isRead && 'font-semibold')}>
        {fromName}
      </div>

      {/* Subject and preview */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('truncate', !isRead && 'font-semibold')}>
            {email.subject || '(no subject)'}
          </span>
          {email.hasAttachments && (
            <Paperclip className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          )}
        </div>
        <div className="text-sm text-muted-foreground truncate">
          {truncate(email.previewText, 100)}
        </div>
      </div>

      {/* Date */}
      <div className="text-sm text-muted-foreground whitespace-nowrap">
        {formatDate(email.date)}
      </div>
    </div>
  );
}

export function EmailList() {
  const parentRef = useRef<HTMLDivElement>(null);
  const {
    selectedAccountId,
    selectedFolderId,
    selectedEmailId,
    selectedEmailIds,
    setSelectedEmail,
    toggleEmailSelection,
  } = useMailStore();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteEmails(selectedAccountId, selectedFolderId);

  const updateFlags = useUpdateFlags();
  const syncFolder = useSyncFolder();

  // Flatten all pages of emails
  const emails = useMemo(() => {
    return data?.pages.flatMap((page) => page.emails) ?? [];
  }, [data]);

  // Auto-sync when folder is empty and hasn't been synced yet
  useEffect(() => {
    if (selectedAccountId && selectedFolderId && !isLoading && emails.length === 0 && !syncFolder.isPending) {
      // Don't auto-sync if we've already tried
      const syncKey = `synced_${selectedFolderId}`;
      if (!sessionStorage.getItem(syncKey)) {
        sessionStorage.setItem(syncKey, 'true');
        syncFolder.mutate({ accountId: selectedAccountId, folderId: selectedFolderId });
      }
    }
  }, [selectedAccountId, selectedFolderId, isLoading, emails.length, syncFolder]);

  // Virtual list
  const virtualizer = useVirtualizer({
    count: emails.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72, // Estimated row height
    overscan: 10,
  });

  // Load more when scrolling near the end
  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    const scrolledToBottom = scrollTop + clientHeight >= scrollHeight - 200;

    if (scrolledToBottom && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const handleToggleStar = useCallback(
    (email: EmailHeader) => {
      if (!selectedAccountId) return;

      const isStarred = email.flags.includes('\\Flagged');
      updateFlags.mutate({
        accountId: selectedAccountId,
        emailIds: [email.id],
        addFlags: isStarred ? undefined : ['\\Flagged'],
        removeFlags: isStarred ? ['\\Flagged'] : undefined,
      });
    },
    [selectedAccountId, updateFlags],
  );

  if (!selectedAccountId || !selectedFolderId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Select a folder to view emails
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Loading emails...
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground">
        {syncFolder.isPending ? (
          <>
            <RefreshCw className="h-8 w-8 animate-spin" />
            <span>Syncing emails from server...</span>
          </>
        ) : (
          <>
            <span>No emails in this folder</span>
            <Button
              variant="outline"
              onClick={() => {
                if (selectedAccountId && selectedFolderId) {
                  syncFolder.mutate({ accountId: selectedAccountId, folderId: selectedFolderId });
                }
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Sync from server
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="h-full overflow-auto"
      onScroll={handleScroll}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const email = emails[virtualRow.index];
          return (
            <div
              key={email.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <EmailRow
                email={email}
                isSelected={selectedEmailId === email.id}
                isChecked={selectedEmailIds.has(email.id)}
                onSelect={() => setSelectedEmail(email.id)}
                onToggleCheck={() => toggleEmailSelection(email.id)}
                onToggleStar={() => handleToggleStar(email)}
              />
            </div>
          );
        })}
      </div>
      {isFetchingNextPage && (
        <div className="py-4 text-center text-sm text-muted-foreground">
          Loading more...
        </div>
      )}
    </div>
  );
}
