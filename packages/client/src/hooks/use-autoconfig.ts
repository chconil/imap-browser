import { useMutation } from '@tanstack/react-query';
import { autoconfigApi } from '@/lib/api';
import type { AutoconfigLookupInput } from '@imap-browser/shared';

export function useAutoconfig() {
  return useMutation({
    mutationFn: (input: AutoconfigLookupInput) => autoconfigApi.lookup(input),
  });
}
