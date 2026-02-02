import { useEffect, useState, createContext, useContext } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { LoginPage } from '@/pages/LoginPage';
import { MailPage } from '@/pages/MailPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

type Page = 'mail' | 'settings';

interface NavigationContextType {
  currentPage: Page;
  navigate: (page: Page) => void;
}

const NavigationContext = createContext<NavigationContextType | null>(null);

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider');
  return ctx;
}

function AppContent() {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const [currentPage, setCurrentPage] = useState<Page>('mail');

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Show main app
  return (
    <NavigationContext.Provider value={{ currentPage, navigate: setCurrentPage }}>
      {currentPage === 'mail' && <MailPage />}
      {currentPage === 'settings' && <SettingsPage />}
    </NavigationContext.Provider>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
