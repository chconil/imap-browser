import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/lib/api';
import type { UpdateSettingsInput } from '@imap-browser/shared';

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { settings } = await settingsApi.get();
      return settings;
    },
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateSettingsInput) => settingsApi.update(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}
