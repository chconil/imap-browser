import { ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { useWebSocket } from '@/hooks/use-websocket';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  // Initialize WebSocket connection and keyboard shortcuts
  useWebSocket();
  useKeyboardShortcuts();

  return (
    <div className="h-screen flex flex-col">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
