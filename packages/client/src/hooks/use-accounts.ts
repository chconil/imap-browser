import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountsApi } from '@/lib/api';
import type { CreateAccountInput, UpdateAccountInput } from '@imap-browser/shared';

export function useAccounts() {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const { accounts } = await accountsApi.list();
      return accounts;
    },
  });
}

export function useAccount(accountId: string | null) {
  return useQuery({
    queryKey: ['accounts', accountId],
    queryFn: async () => {
      if (!accountId) return null;
      const { account } = await accountsApi.get(accountId);
      return account;
    },
    enabled: !!accountId,
  });
}

export function useFolders(accountId: string | null) {
  return useQuery({
    queryKey: ['folders', accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const { folders } = await accountsApi.getFolders(accountId);
      return folders;
    },
    enabled: !!accountId,
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateAccountInput) => accountsApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ accountId, input }: { accountId: string; input: UpdateAccountInput }) =>
      accountsApi.update(accountId, input),
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounts', accountId] });
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accountId: string) => accountsApi.delete(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

export function useSyncAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accountId: string) => accountsApi.sync(accountId),
    onSuccess: (_, accountId) => {
      queryClient.invalidateQueries({ queryKey: ['folders', accountId] });
    },
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: accountsApi.testConnection,
  });
}

export function useReorderAccounts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accountIds: string[]) => accountsApi.reorder(accountIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}
