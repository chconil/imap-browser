import { useAuthStore } from '@/stores/auth-store';
import { useMailStore } from '@/stores/mail-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useNavigation } from '@/App';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SearchBar } from '@/components/search/SearchBar';
import {
  Menu,
  Sun,
  Moon,
  Monitor,
  Settings,
  LogOut,
  Mail,
  ArrowLeft,
} from 'lucide-react';
import { getInitials } from '@/lib/utils';

export function Header() {
  const { user, logout } = useAuthStore();
  const { toggleSidebar } = useMailStore();
  const { theme, setTheme } = useSettingsStore();
  const { currentPage, navigate } = useNavigation();

  const isOnSettings = currentPage === 'settings';

  return (
    <header className="h-14 border-b bg-card flex items-center justify-between px-4 gap-4">
      {/* Left section */}
      <div className="flex items-center gap-2">
        {isOnSettings ? (
          <Button variant="ghost" size="icon" onClick={() => navigate('mail')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" onClick={toggleSidebar}>
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <div className="flex items-center gap-2">
          <Mail className="h-6 w-6 text-primary" />
          <span className="font-semibold text-lg hidden sm:inline">
            {isOnSettings ? 'Settings' : 'IMAP Browser'}
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="flex-1 flex justify-center">
        <SearchBar />
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              {theme === 'light' ? (
                <Sun className="h-5 w-5" />
              ) : theme === 'dark' ? (
                <Moon className="h-5 w-5" />
              ) : (
                <Monitor className="h-5 w-5" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme('light')}>
              <Sun className="h-4 w-4 mr-2" />
              Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('dark')}>
              <Moon className="h-4 w-4 mr-2" />
              Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('system')}>
              <Monitor className="h-4 w-4 mr-2" />
              System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full">
              <Avatar className="h-9 w-9">
                <AvatarFallback>
                  {user ? getInitials(user.displayName) : '?'}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.displayName}</p>
                <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('settings')}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout}>
              <LogOut className="h-4 w-4 mr-2" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
