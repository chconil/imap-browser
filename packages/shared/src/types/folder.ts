import { z } from 'zod';

// Special folder types
export const SpecialFolder = {
  INBOX: 'inbox',
  SENT: 'sent',
  DRAFTS: 'drafts',
  TRASH: 'trash',
  SPAM: 'spam',
  ARCHIVE: 'archive',
  ALL: 'all',
  FLAGGED: 'flagged',
} as const;

export type SpecialFolder = (typeof SpecialFolder)[keyof typeof SpecialFolder];

// Folder schema
export const folderSchema = z.object({
  id: z.string(),
  accountId: z.string().uuid(),
  name: z.string(),
  path: z.string(),
  delimiter: z.string(),
  parentPath: z.string().nullable(),
  specialUse: z.string().nullable(),
  // Counts
  totalMessages: z.number().int(),
  unreadMessages: z.number().int(),
  // IMAP state
  uidValidity: z.number().int().nullable(),
  uidNext: z.number().int().nullable(),
  highestModSeq: z.string().nullable(),
  // Flags
  isSubscribed: z.boolean(),
  isSelectable: z.boolean(),
  hasChildren: z.boolean(),
  // Timestamps
  lastSyncAt: z.string().datetime().nullable(),
});

export type Folder = z.infer<typeof folderSchema>;

// Folder tree node (for UI)
export interface FolderTreeNode extends Folder {
  children: FolderTreeNode[];
  level: number;
  isExpanded: boolean;
}

// Create folder
export const createFolderSchema = z.object({
  accountId: z.string().uuid(),
  name: z.string().min(1).max(100),
  parentPath: z.string().nullable().default(null),
});

export type CreateFolderInput = z.infer<typeof createFolderSchema>;

// Rename folder
export const renameFolderSchema = z.object({
  newName: z.string().min(1).max(100),
});

export type RenameFolderInput = z.infer<typeof renameFolderSchema>;

// Folder list response
export const folderListResponseSchema = z.object({
  folders: z.array(folderSchema),
});

export type FolderListResponse = z.infer<typeof folderListResponseSchema>;

// Helper to build folder tree from flat list
export function buildFolderTree(folders: Folder[]): FolderTreeNode[] {
  const map = new Map<string, FolderTreeNode>();
  const roots: FolderTreeNode[] = [];

  // Create nodes
  for (const folder of folders) {
    map.set(folder.path, {
      ...folder,
      children: [],
      level: 0,
      isExpanded: false,
    });
  }

  // Build tree
  for (const folder of folders) {
    const node = map.get(folder.path)!;
    if (folder.parentPath && map.has(folder.parentPath)) {
      const parent = map.get(folder.parentPath)!;
      node.level = parent.level + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by name
  const sortChildren = (nodes: FolderTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const node of nodes) {
      sortChildren(node.children);
    }
  };
  sortChildren(roots);

  return roots;
}

// Get special folder icon name
export function getSpecialFolderIcon(specialUse: string | null): string {
  switch (specialUse) {
    case SpecialFolder.INBOX:
      return 'inbox';
    case SpecialFolder.SENT:
      return 'send';
    case SpecialFolder.DRAFTS:
      return 'file-text';
    case SpecialFolder.TRASH:
      return 'trash-2';
    case SpecialFolder.SPAM:
      return 'alert-octagon';
    case SpecialFolder.ARCHIVE:
      return 'archive';
    case SpecialFolder.ALL:
      return 'mail';
    case SpecialFolder.FLAGGED:
      return 'star';
    default:
      return 'folder';
  }
}
