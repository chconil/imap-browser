import { cn } from '@/lib/utils';
import { useMailStore } from '@/stores/mail-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useAccounts, useFolders } from '@/hooks/use-accounts';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  AlertOctagon,
  Archive,
  Star,
  Folder,
  ChevronRight,
  ChevronDown,
  Plus,
  RefreshCw,
  Mail,
} from 'lucide-react';
import { buildFolderTree, type FolderTreeNode } from '@imap-browser/shared';
import { useState } from 'react';
import { AddAccountDialog } from '@/components/accounts/AddAccountDialog';

const FOLDER_ICONS: Record<string, typeof Inbox> = {
  inbox: Inbox,
  sent: Send,
  drafts: FileText,
  trash: Trash2,
  spam: AlertOctagon,
  archive: Archive,
  flagged: Star,
  all: Mail,
};

function FolderIcon({ specialUse }: { specialUse: string | null }) {
  const Icon = specialUse ? FOLDER_ICONS[specialUse] || Folder : Folder;
  return <Icon className="h-4 w-4" />;
}

function FolderItem({
  folder,
  level = 0,
  selectedFolderId,
  onSelect,
}: {
  folder: FolderTreeNode;
  level?: number;
  selectedFolderId: string | null;
  onSelect: (folderId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(folder.specialUse === 'inbox');
  const hasChildren = folder.children.length > 0;

  return (
    <div>
      <button
        onClick={() => onSelect(folder.id)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent',
          selectedFolderId === folder.id && 'bg-accent',
        )}
        style={{ paddingLeft: `${8 + level * 16}px` }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-0.5 hover:bg-muted rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <FolderIcon specialUse={folder.specialUse} />
        <span className="flex-1 truncate text-left">{folder.name}</span>
        {folder.unreadMessages > 0 && (
          <span className="text-xs font-medium text-muted-foreground">
            {folder.unreadMessages}
          </span>
        )}
      </button>
      {hasChildren && isExpanded && (
        <div>
          {folder.children.map((child) => (
            <FolderItem
              key={child.id}
              folder={child}
              level={level + 1}
              selectedFolderId={selectedFolderId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { data: accounts = [] } = useAccounts();
  const {
    selectedAccountId,
    selectedFolderId,
    setSelectedAccount,
    setSelectedFolder,
    isSidebarCollapsed,
    openCompose,
  } = useMailStore();
  const { navigationMode } = useSettingsStore();

  const { data: folders = [], isLoading: foldersLoading, refetch: refetchFolders } = useFolders(selectedAccountId);

  const folderTree = buildFolderTree(folders);

  // Set default account and inbox on first load
  if (!selectedAccountId && accounts.length > 0) {
    setSelectedAccount(accounts[0].id);
  }

  // Set inbox as default folder when account changes
  if (selectedAccountId && !selectedFolderId && folders.length > 0) {
    const inbox = folders.find((f) => f.specialUse === 'inbox');
    if (inbox) {
      setSelectedFolder(inbox.id);
    } else if (folders[0]) {
      setSelectedFolder(folders[0].id);
    }
  }

  if (isSidebarCollapsed) {
    return (
      <div className="w-16 border-r bg-card flex flex-col items-center py-4 gap-2">
        <Button
          size="icon"
          onClick={() => openCompose('new')}
          className="mb-4"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" title="Inbox">
          <Inbox className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" title="Sent">
          <Send className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" title="Drafts">
          <FileText className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" title="Trash">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-64 border-r bg-card flex flex-col">
      {/* Compose button */}
      <div className="p-4 space-y-2">
        <Button onClick={() => openCompose('new')} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Compose
        </Button>
        <AddAccountDialog />
      </div>

      {/* Account selector (dropdown mode) */}
      {navigationMode === 'dropdown' && (
        <div className="px-4 pb-2">
          <Select
            value={selectedAccountId || ''}
            onValueChange={(value) => {
              setSelectedAccount(value);
              setSelectedFolder(null);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'h-2 w-2 rounded-full',
                        account.isConnected ? 'bg-green-500' : 'bg-red-500',
                      )}
                    />
                    {account.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Folder list */}
      <ScrollArea className="flex-1">
        <div className="px-2 py-2">
          {foldersLoading ? (
            <div className="px-2 py-4 text-sm text-muted-foreground">Loading folders...</div>
          ) : folderTree.length === 0 ? (
            <div className="px-2 py-4 text-sm text-muted-foreground">No folders</div>
          ) : (
            folderTree.map((folder) => (
              <FolderItem
                key={folder.id}
                folder={folder}
                selectedFolderId={selectedFolderId}
                onSelect={setSelectedFolder}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Sync button */}
      {selectedAccountId && (
        <div className="p-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => refetchFolders()}
            disabled={foldersLoading}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', foldersLoading && 'animate-spin')} />
            Sync folders
          </Button>
        </div>
      )}
    </div>
  );
}
