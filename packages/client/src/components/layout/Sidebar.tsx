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
import { buildFolderTree, type FolderTreeNode, type Account } from '@imap-browser/shared';
import { useState } from 'react';
import { AddAccountDialog } from '@/components/accounts/AddAccountDialog';
import { AccountMenu } from '@/components/accounts/AccountMenu';
import { EditAccountDialog } from '@/components/accounts/EditAccountDialog';

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

function AccountTreeItem({
  account,
  isSelected,
  selectedFolderId,
  onSelectAccount,
  onSelectFolder,
  onEdit,
}: {
  account: Account;
  isSelected: boolean;
  selectedFolderId: string | null;
  onSelectAccount: (accountId: string) => void;
  onSelectFolder: (folderId: string) => void;
  onEdit: (account: Account) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(isSelected);
  const { data: folders = [], isLoading } = useFolders(account.id);
  const folderTree = buildFolderTree(folders);

  // Auto-expand when account is selected
  if (isSelected && !isExpanded) {
    setIsExpanded(true);
  }

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent',
          isSelected && 'bg-accent/50',
        )}
      >
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-0.5 hover:bg-muted rounded"
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>
        <button
          onClick={() => {
            onSelectAccount(account.id);
            setIsExpanded(true);
          }}
          className="flex-1 flex items-center gap-2 text-left"
        >
          <div
            className={cn(
              'h-2 w-2 rounded-full',
              account.isConnected ? 'bg-green-500' : 'bg-red-500',
            )}
          />
          <span className="flex-1 truncate font-medium">{account.name}</span>
        </button>
        <AccountMenu account={account} onEdit={onEdit} />
      </div>
      {isExpanded && (
        <div className="ml-2">
          {isLoading ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">Loading...</div>
          ) : folderTree.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">No folders</div>
          ) : (
            folderTree.map((folder) => (
              <FolderItem
                key={folder.id}
                folder={folder}
                level={1}
                selectedFolderId={isSelected ? selectedFolderId : null}
                onSelect={(folderId) => {
                  onSelectAccount(account.id);
                  onSelectFolder(folderId);
                }}
              />
            ))
          )}
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
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  const { data: folders = [], isLoading: foldersLoading, refetch: refetchFolders } = useFolders(selectedAccountId);
  const selectedAccount = accounts.find(a => a.id === selectedAccountId) || null;

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
          <div className="flex items-center gap-1">
            <Select
              value={selectedAccountId || ''}
              onValueChange={(value) => {
                setSelectedAccount(value);
                setSelectedFolder(null);
              }}
            >
              <SelectTrigger className="flex-1">
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
            {selectedAccount && (
              <AccountMenu account={selectedAccount} onEdit={setEditingAccount} />
            )}
          </div>
        </div>
      )}

      {/* Folder list */}
      <ScrollArea className="flex-1">
        <div className="px-2 py-2">
          {navigationMode === 'tree' ? (
            // Tree mode: show all accounts with their folders
            accounts.length === 0 ? (
              <div className="px-2 py-4 text-sm text-muted-foreground">No accounts</div>
            ) : (
              accounts.map((account) => (
                <AccountTreeItem
                  key={account.id}
                  account={account}
                  isSelected={selectedAccountId === account.id}
                  selectedFolderId={selectedFolderId}
                  onSelectAccount={setSelectedAccount}
                  onSelectFolder={setSelectedFolder}
                  onEdit={setEditingAccount}
                />
              ))
            )
          ) : (
            // Dropdown mode: show folders for selected account
            foldersLoading ? (
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
            )
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

      {/* Edit Account Dialog */}
      <EditAccountDialog
        account={editingAccount}
        open={!!editingAccount}
        onOpenChange={(open) => !open && setEditingAccount(null)}
      />
    </div>
  );
}
