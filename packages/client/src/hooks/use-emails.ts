import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { emailsApi } from '@/lib/api';
import { useMailStore } from '@/stores/mail-store';

export function useEmails(
  accountId: string | null,
  folderId: string | null,
  options?: {
    page?: number;
    pageSize?: number;
    search?: string;
    sortBy?: 'date' | 'from' | 'subject' | 'size';
    sortOrder?: 'asc' | 'desc';
  },
) {
  return useQuery({
    queryKey: ['emails', accountId, folderId, options],
    queryFn: async () => {
      if (!accountId || !folderId) {
        return { emails: [], total: 0, page: 1, pageSize: 50, hasMore: false };
      }
      return emailsApi.list(accountId, folderId, options);
    },
    enabled: !!accountId && !!folderId,
  });
}

export function useInfiniteEmails(
  accountId: string | null,
  folderId: string | null,
  pageSize = 50,
) {
  return useInfiniteQuery({
    queryKey: ['emails', 'infinite', accountId, folderId],
    queryFn: async ({ pageParam = 1 }) => {
      if (!accountId || !folderId) {
        return { emails: [], total: 0, page: 1, pageSize, hasMore: false };
      }
      return emailsApi.list(accountId, folderId, { page: pageParam, pageSize });
    },
    enabled: !!accountId && !!folderId,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.hasMore) {
        return lastPage.page + 1;
      }
      return undefined;
    },
  });
}

export function useEmail(accountId: string | null, emailId: string | null) {
  return useQuery({
    queryKey: ['email', accountId, emailId],
    queryFn: async () => {
      if (!accountId || !emailId) return null;
      const { email } = await emailsApi.get(accountId, emailId);
      return email;
    },
    enabled: !!accountId && !!emailId,
  });
}

export function useUpdateFlags() {
  const queryClient = useQueryClient();
  const { selectedAccountId, selectedFolderId } = useMailStore();

  return useMutation({
    mutationFn: ({
      accountId,
      emailIds,
      addFlags,
      removeFlags,
    }: {
      accountId: string;
      emailIds: string[];
      addFlags?: string[];
      removeFlags?: string[];
    }) => emailsApi.updateFlags(accountId, emailIds, addFlags, removeFlags),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails', selectedAccountId, selectedFolderId] });
      queryClient.invalidateQueries({ queryKey: ['folders', selectedAccountId] });
    },
  });
}

export function useMoveEmails() {
  const queryClient = useQueryClient();
  const { selectedAccountId, selectedFolderId, clearEmailSelection } = useMailStore();

  return useMutation({
    mutationFn: ({
      accountId,
      emailIds,
      targetFolderId,
    }: {
      accountId: string;
      emailIds: string[];
      targetFolderId: string;
    }) => emailsApi.move(accountId, emailIds, targetFolderId),
    onSuccess: () => {
      clearEmailSelection();
      queryClient.invalidateQueries({ queryKey: ['emails', selectedAccountId, selectedFolderId] });
      queryClient.invalidateQueries({ queryKey: ['folders', selectedAccountId] });
    },
  });
}

export function useDeleteEmails() {
  const queryClient = useQueryClient();
  const { selectedAccountId, selectedFolderId, clearEmailSelection, setSelectedEmail } = useMailStore();

  return useMutation({
    mutationFn: ({
      accountId,
      emailIds,
      permanent,
    }: {
      accountId: string;
      emailIds: string[];
      permanent?: boolean;
    }) => emailsApi.delete(accountId, emailIds, permanent),
    onSuccess: () => {
      setSelectedEmail(null);
      clearEmailSelection();
      queryClient.invalidateQueries({ queryKey: ['emails', selectedAccountId, selectedFolderId] });
      queryClient.invalidateQueries({ queryKey: ['folders', selectedAccountId] });
    },
  });
}

export function useSearchEmails() {
  const { searchQuery, selectedAccountId, selectedFolderId } = useMailStore();

  return useQuery({
    queryKey: ['search', searchQuery, selectedAccountId, selectedFolderId],
    queryFn: async () => {
      if (!searchQuery) return { emails: [] };
      return emailsApi.search(searchQuery, selectedAccountId || undefined, selectedFolderId || undefined);
    },
    enabled: !!searchQuery,
  });
}

export function useSyncFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ accountId, folderId }: { accountId: string; folderId: string }) =>
      emailsApi.syncFolder(accountId, folderId),
    onSuccess: (_, { accountId, folderId }) => {
      queryClient.invalidateQueries({ queryKey: ['emails', accountId, folderId] });
      queryClient.invalidateQueries({ queryKey: ['folders', accountId] });
    },
  });
}
