import { useMailStore } from '@/stores/mail-store';
import { useFolders } from '@/hooks/use-accounts';
import { useUpdateFlags, useMoveEmails, useDeleteEmails, useSyncFolder } from '@/hooks/use-emails';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Mail,
  MailOpen,
  Trash2,
  Archive,
  FolderInput,
  RefreshCw,
  MoreHorizontal,
  Star,
  Tag,
} from 'lucide-react';

interface EmailToolbarProps {
  emailIds: string[];
  totalEmails: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
}

export function EmailToolbar({
  emailIds,
  totalEmails,
  onSelectAll,
  onClearSelection,
}: EmailToolbarProps) {
  const { selectedAccountId, selectedFolderId } = useMailStore();
  const { data: folders = [] } = useFolders(selectedAccountId);
  const updateFlags = useUpdateFlags();
  const moveEmails = useMoveEmails();
  const deleteEmails = useDeleteEmails();
  const syncFolder = useSyncFolder();

  const selectedCount = emailIds.length;
  const hasSelection = selectedCount > 0;
  const allSelected = selectedCount === totalEmails && totalEmails > 0;

  const handleMarkRead = () => {
    if (!selectedAccountId || !hasSelection) return;
    updateFlags.mutate({
      accountId: selectedAccountId,
      emailIds,
      addFlags: ['\\Seen'],
    });
    onClearSelection();
  };

  const handleMarkUnread = () => {
    if (!selectedAccountId || !hasSelection) return;
    updateFlags.mutate({
      accountId: selectedAccountId,
      emailIds,
      removeFlags: ['\\Seen'],
    });
    onClearSelection();
  };

  const handleToggleStar = () => {
    if (!selectedAccountId || !hasSelection) return;
    // For bulk operations, add star to all
    updateFlags.mutate({
      accountId: selectedAccountId,
      emailIds,
      addFlags: ['\\Flagged'],
    });
  };

  const handleRemoveStar = () => {
    if (!selectedAccountId || !hasSelection) return;
    updateFlags.mutate({
      accountId: selectedAccountId,
      emailIds,
      removeFlags: ['\\Flagged'],
    });
  };

  const handleArchive = () => {
    if (!selectedAccountId || !hasSelection) return;
    const archiveFolder = folders.find((f) => f.specialUse === 'archive');
    if (archiveFolder) {
      moveEmails.mutate({
        accountId: selectedAccountId,
        emailIds,
        targetFolderId: archiveFolder.id,
      });
    }
  };

  const handleMoveToFolder = (folderId: string) => {
    if (!selectedAccountId || !hasSelection) return;
    moveEmails.mutate({
      accountId: selectedAccountId,
      emailIds,
      targetFolderId: folderId,
    });
  };

  const handleDelete = () => {
    if (!selectedAccountId || !hasSelection) return;
    deleteEmails.mutate({
      accountId: selectedAccountId,
      emailIds,
    });
  };

  const handleSync = () => {
    if (!selectedAccountId || !selectedFolderId) return;
    syncFolder.mutate({
      accountId: selectedAccountId,
      folderId: selectedFolderId,
    });
  };

  return (
    <div className="flex items-center gap-2 p-2 border-b bg-background">
      {/* Select all checkbox */}
      <Checkbox
        checked={allSelected}
        onCheckedChange={(checked) => {
          if (checked) {
            onSelectAll();
          } else {
            onClearSelection();
          }
        }}
      />

      {hasSelection ? (
        <>
          <span className="text-sm text-muted-foreground px-2">
            {selectedCount} selected
          </span>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMarkRead}
                  disabled={updateFlags.isPending}
                >
                  <MailOpen className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Mark as read</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMarkUnread}
                  disabled={updateFlags.isPending}
                >
                  <Mail className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Mark as unread</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleArchive}
                  disabled={moveEmails.isPending || !folders.find((f) => f.specialUse === 'archive')}
                >
                  <Archive className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Archive</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleteEmails.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>

            {/* Move to folder dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" disabled={moveEmails.isPending}>
                  <FolderInput className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {folders
                  .filter((f) => f.id !== selectedFolderId)
                  .map((folder) => (
                    <DropdownMenuItem
                      key={folder.id}
                      onClick={() => handleMoveToFolder(folder.id)}
                    >
                      {folder.name}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* More actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={handleToggleStar}>
                  <Star className="h-4 w-4 mr-2" />
                  Add star
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleRemoveStar}>
                  <Star className="h-4 w-4 mr-2" />
                  Remove star
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onClearSelection}>
                  <Tag className="h-4 w-4 mr-2" />
                  Clear selection
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TooltipProvider>
        </>
      ) : (
        <div className="flex-1" />
      )}

      <div className="flex-1" />

      {/* Sync button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSync}
              disabled={syncFolder.isPending || !selectedAccountId || !selectedFolderId}
            >
              <RefreshCw className={`h-4 w-4 ${syncFolder.isPending ? 'animate-spin' : ''}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Sync folder</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
