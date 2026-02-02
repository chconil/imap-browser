import { useState } from 'react';
import { useDeleteAccount } from '@/hooks/use-accounts';
import { useMailStore } from '@/stores/mail-store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { Account } from '@imap-browser/shared';

interface AccountMenuProps {
  account: Account;
  onEdit: (account: Account) => void;
}

export function AccountMenu({ account, onEdit }: AccountMenuProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteAccount = useDeleteAccount();
  const { selectedAccountId, setSelectedAccount } = useMailStore();

  const handleDelete = async () => {
    setDeleteError(null);
    try {
      await deleteAccount.mutateAsync(account.id);
      // If we deleted the selected account, clear selection
      if (selectedAccountId === account.id) {
        setSelectedAccount(null);
      }
      setShowDeleteDialog(false);
    } catch (error) {
      console.error('Failed to delete account:', error);
      const message = error instanceof Error ? error.message : 'Failed to delete account';
      setDeleteError(message);
    }
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setDeleteError(null);
    }
    setShowDeleteDialog(open);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(account)}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit account
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete account
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={handleDialogClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the account "{account.name}" ({account.email})
              and all synced emails. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {deleteError}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAccount.isPending}>Cancel</AlertDialogCancel>
            <Button
              onClick={handleDelete}
              disabled={deleteAccount.isPending}
              variant="destructive"
            >
              {deleteAccount.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
