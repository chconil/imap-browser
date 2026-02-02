import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { authService } from '../services/auth/auth-service.js';
import { imapConnectionPool } from '../services/imap/connection-pool.js';
import type { WebSocketEventPayload, WebSocketEvent as WSEvent } from '@imap-browser/shared';

interface ClientConnection {
  ws: WebSocket;
  userId: string;
  sessionId: string;
  accountSubscriptions: Set<string>;
}

class WebSocketManager {
  private clients = new Map<string, ClientConnection>();
  private userConnections = new Map<string, Set<string>>(); // userId -> Set<connectionId>

  constructor() {
    this.setupImapListeners();
  }

  private setupImapListeners(): void {
    imapConnectionPool.on('connected', (accountId: string) => {
      this.broadcastToAccountSubscribers(accountId, {
        type: 'account_connected' as const,
        accountId,
      });
    });

    imapConnectionPool.on('disconnected', (accountId: string, reason?: string) => {
      this.broadcastToAccountSubscribers(accountId, {
        type: 'account_disconnected' as const,
        accountId,
        reason,
      });
    });

    imapConnectionPool.on('error', (accountId: string, error: Error) => {
      this.broadcastToAccountSubscribers(accountId, {
        type: 'account_error' as const,
        accountId,
        error: error.message,
      });
    });

    imapConnectionPool.on('newMail', (accountId: string, mailbox: string, count: number) => {
      // This would need to fetch the actual emails and broadcast them
      // For now, just notify that new mail arrived
      this.broadcastToAccountSubscribers(accountId, {
        type: 'sync_completed' as const,
        accountId,
        folderId: mailbox,
        newMessages: count,
      });
    });
  }

  addConnection(connectionId: string, ws: WebSocket, userId: string, sessionId: string): void {
    this.clients.set(connectionId, {
      ws,
      userId,
      sessionId,
      accountSubscriptions: new Set(),
    });

    let userConns = this.userConnections.get(userId);
    if (!userConns) {
      userConns = new Set();
      this.userConnections.set(userId, userConns);
    }
    userConns.add(connectionId);
  }

  removeConnection(connectionId: string): void {
    const client = this.clients.get(connectionId);
    if (client) {
      const userConns = this.userConnections.get(client.userId);
      if (userConns) {
        userConns.delete(connectionId);
        if (userConns.size === 0) {
          this.userConnections.delete(client.userId);
        }
      }
      this.clients.delete(connectionId);
    }
  }

  subscribeToAccount(connectionId: string, accountId: string): void {
    const client = this.clients.get(connectionId);
    if (client) {
      client.accountSubscriptions.add(accountId);
    }
  }

  unsubscribeFromAccount(connectionId: string, accountId: string): void {
    const client = this.clients.get(connectionId);
    if (client) {
      client.accountSubscriptions.delete(accountId);
    }
  }

  broadcastToUser(userId: string, event: WebSocketEventPayload): void {
    const userConns = this.userConnections.get(userId);
    if (!userConns) return;

    const message = JSON.stringify(event);
    for (const connectionId of userConns) {
      const client = this.clients.get(connectionId);
      if (client && client.ws.readyState === 1) { // OPEN
        client.ws.send(message);
      }
    }
  }

  broadcastToAccountSubscribers(accountId: string, event: WebSocketEventPayload): void {
    const message = JSON.stringify(event);
    for (const client of this.clients.values()) {
      if (client.accountSubscriptions.has(accountId) && client.ws.readyState === 1) {
        client.ws.send(message);
      }
    }
  }

  getConnectionCount(): number {
    return this.clients.size;
  }
}

export const wsManager = new WebSocketManager();

interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping';
  accountId?: string;
}

export async function registerWebSocketRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/ws', { websocket: true }, async (socket: WebSocket, req: FastifyRequest) => {
    // Authenticate via session cookie
    const sessionId = (req.cookies as Record<string, string>)?.session;

    if (!sessionId) {
      socket.close(4001, 'Unauthorized');
      return;
    }

    const auth = await authService.validateSession(sessionId);
    if (!auth) {
      socket.close(4001, 'Invalid session');
      return;
    }

    const connectionId = `${auth.user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    wsManager.addConnection(connectionId, socket, auth.user.id, sessionId);

    // Send connected event
    socket.send(JSON.stringify({ type: 'connected' }));

    socket.on('message', (data: Buffer | string) => {
      try {
        const message: WSMessage = JSON.parse(data.toString());

        switch (message.type) {
          case 'subscribe':
            if (message.accountId) {
              wsManager.subscribeToAccount(connectionId, message.accountId);
              socket.send(JSON.stringify({
                type: 'subscribed',
                accountId: message.accountId,
              }));
            }
            break;

          case 'unsubscribe':
            if (message.accountId) {
              wsManager.unsubscribeFromAccount(connectionId, message.accountId);
            }
            break;

          case 'ping':
            socket.send(JSON.stringify({ type: 'pong' }));
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    });

    socket.on('close', () => {
      wsManager.removeConnection(connectionId);
    });

    socket.on('error', () => {
      wsManager.removeConnection(connectionId);
    });
  });
}
