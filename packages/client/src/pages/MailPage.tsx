import { useMailStore } from '@/stores/mail-store';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmailList } from '@/components/emails/EmailList';
import { EmailView } from '@/components/emails/EmailView';
import { ComposeDialog } from '@/components/compose/ComposeDialog';
import { cn } from '@/lib/utils';

export function MailPage() {
  const { selectedEmailId } = useMailStore();

  return (
    <AppLayout>
      <div className="h-full flex">
        {/* Email list */}
        <div
          className={cn(
            'border-r bg-card transition-all',
            selectedEmailId ? 'w-2/5 min-w-[400px]' : 'flex-1',
          )}
        >
          <EmailList />
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
