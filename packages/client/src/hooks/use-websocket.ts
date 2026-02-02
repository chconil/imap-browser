import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMailStore } from '@/stores/mail-store';
import type { WebSocketEventPayload } from '@imap-browser/shared';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();
  const { selectedAccountId } = useMailStore();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      console.log('WebSocket connected');

      // Subscribe to selected account
      if (selectedAccountId) {
        ws.send(JSON.stringify({ type: 'subscribe', accountId: selectedAccountId }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const payload: WebSocketEventPayload = JSON.parse(event.data);
        handleEvent(payload);
      } catch {
        // Ignore parsing errors
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      // Reconnect after 5 seconds
      reconnectTimeoutRef.current = setTimeout(connect, 5000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [selectedAccountId]);

  const handleEvent = useCallback((event: WebSocketEventPayload) => {
    switch (event.type) {
      case 'new_email':
        // Invalidate email list for the affected folder
        queryClient.invalidateQueries({ queryKey: ['emails', event.accountId, event.folderId] });
        queryClient.invalidateQueries({ queryKey: ['folders', event.accountId] });
        break;

      case 'email_updated':
        // Invalidate specific email and list
        queryClient.invalidateQueries({ queryKey: ['email', event.accountId, event.emailId] });
        queryClient.invalidateQueries({ queryKey: ['emails', event.accountId] });
        break;

      case 'email_deleted':
        // Invalidate email list
        queryClient.invalidateQueries({ queryKey: ['emails', event.accountId] });
        queryClient.invalidateQueries({ queryKey: ['folders', event.accountId] });
        break;

      case 'folder_updated':
        // Invalidate folders
        queryClient.invalidateQueries({ queryKey: ['folders', event.accountId] });
        break;

      case 'sync_completed':
        // Invalidate emails and folders
        if (event.folderId) {
          queryClient.invalidateQueries({ queryKey: ['emails', event.accountId, event.folderId] });
        }
        queryClient.invalidateQueries({ queryKey: ['folders', event.accountId] });
        break;

      case 'account_connected':
      case 'account_disconnected':
      case 'account_error':
        // Invalidate accounts
        queryClient.invalidateQueries({ queryKey: ['accounts'] });
        queryClient.invalidateQueries({ queryKey: ['accounts', event.accountId] });
        break;
    }
  }, [queryClient]);

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  // Subscribe to account changes
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && selectedAccountId) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', accountId: selectedAccountId }));
    }
  }, [selectedAccountId]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
  };
}
