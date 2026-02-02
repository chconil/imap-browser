import { useMemo } from 'react';
import { useMailStore } from '@/stores/mail-store';
import { useInfiniteEmails } from '@/hooks/use-emails';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmailList } from '@/components/emails/EmailList';
import { EmailToolbar } from '@/components/emails/EmailToolbar';
import { EmailView } from '@/components/emails/EmailView';
import { ComposeDialog } from '@/components/compose/ComposeDialog';
import { cn } from '@/lib/utils';

export function MailPage() {
  const {
    selectedAccountId,
    selectedFolderId,
    selectedEmailId,
    selectedEmailIds,
    selectAllEmails,
    clearEmailSelection,
  } = useMailStore();

  const { data } = useInfiniteEmails(selectedAccountId, selectedFolderId);

  // Flatten all pages of emails
  const emails = useMemo(() => {
    return data?.pages.flatMap((page) => page.emails) ?? [];
  }, [data]);

  const handleSelectAll = () => {
    selectAllEmails(emails.map((e) => e.id));
  };

  return (
    <AppLayout>
      <div className="h-full flex">
        {/* Email list panel */}
        <div
          className={cn(
            'flex flex-col border-r bg-card transition-all',
            selectedEmailId ? 'w-2/5 min-w-[400px]' : 'flex-1',
          )}
        >
          {/* Toolbar */}
          <EmailToolbar
            emailIds={Array.from(selectedEmailIds)}
            totalEmails={emails.length}
            onSelectAll={handleSelectAll}
            onClearSelection={clearEmailSelection}
          />

          {/* Email list */}
          <div className="flex-1 overflow-hidden">
            <EmailList />
          </div>
        </div>

        {/* Email view */}
        {selectedEmailId && (
          <div className="flex-1 bg-background">
            <EmailView />
          </div>
        )}
      </div>

      {/* Compose dialog */}
      <ComposeDialog />
    </AppLayout>
  );
}
