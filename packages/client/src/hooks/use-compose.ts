import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { composeApi } from '@/lib/api';
import type { ComposeEmailInput, SaveDraftInput } from '@imap-browser/shared';
import { useMailStore } from '@/stores/mail-store';

export function useSendEmail() {
  const { closeCompose } = useMailStore();

  return useMutation({
    mutationFn: (input: ComposeEmailInput) => composeApi.send(input),
    onSuccess: () => {
      closeCompose();
    },
  });
}

export function useSaveDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveDraftInput) => composeApi.saveDraft(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
    },
  });
}

export function useDrafts() {
  return useQuery({
    queryKey: ['drafts'],
    queryFn: async () => {
      const { drafts } = await composeApi.listDrafts();
      return drafts;
    },
  });
}

export function useDraft(draftId: string | null) {
  return useQuery({
    queryKey: ['drafts', draftId],
    queryFn: async () => {
      if (!draftId) return null;
      const { draft } = await composeApi.getDraft(draftId);
      return draft;
    },
    enabled: !!draftId,
  });
}

export function useDeleteDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (draftId: string) => composeApi.deleteDraft(draftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
    },
  });
}

export function useUploadAttachment() {
  return useMutation({
    mutationFn: (file: File) => composeApi.uploadAttachment(file),
  });
}

export function useDeleteAttachment() {
  return useMutation({
    mutationFn: (attachmentId: string) => composeApi.deleteAttachment(attachmentId),
  });
}
