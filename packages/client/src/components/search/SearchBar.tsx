import { useState, useEffect, useRef } from 'react';
import { useMailStore } from '@/stores/mail-store';
import { useSearchEmails } from '@/hooks/use-emails';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, X, Loader2 } from 'lucide-react';
import { cn, formatDate, truncate } from '@/lib/utils';

export function SearchBar() {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    searchQuery,
    setSearchQuery,
    setIsSearching,
    setSelectedAccount,
    setSelectedFolder,
    setSelectedEmail,
  } = useMailStore();

  const { data, isLoading } = useSearchEmails();

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputValue.length >= 2) {
        setSearchQuery(inputValue);
        setIsSearching(true);
        setIsOpen(true);
      } else {
        setSearchQuery('');
        setIsSearching(false);
        setIsOpen(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue, setSearchQuery, setIsSearching]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd/Ctrl + K to focus search
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }

      // Escape to close and clear
      if (event.key === 'Escape' && isOpen) {
        setInputValue('');
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleClear = () => {
    setInputValue('');
    setSearchQuery('');
    setIsSearching(false);
    setIsOpen(false);
  };

  const handleSelectEmail = (email: { id: string; accountId: string; folderId: string }) => {
    setSelectedAccount(email.accountId);
    setSelectedFolder(email.folderId);
    setSelectedEmail(email.id);
    setIsOpen(false);
  };

  const emails = data?.emails ?? [];

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search emails... (⌘K)"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => {
            if (searchQuery && emails.length > 0) {
              setIsOpen(true);
            }
          }}
          className="pl-9 pr-8"
        />
        {inputValue && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
            onClick={handleClear}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Search results dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : emails.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No results found for "{searchQuery}"
            </div>
          ) : (
            <ScrollArea className="max-h-80">
              <div className="py-1">
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
                  {emails.length} result{emails.length !== 1 ? 's' : ''}
                </div>
                {emails.map((email) => {
                  const fromName = email.from[0]?.name || email.from[0]?.address || 'Unknown';
                  const isRead = email.flags.includes('\\Seen');

                  return (
                    <button
                      key={email.id}
                      onClick={() => handleSelectEmail(email)}
                      className={cn(
                        'w-full px-3 py-2 text-left hover:bg-accent transition-colors',
                        !isRead && 'bg-primary/5',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn('text-sm truncate', !isRead && 'font-medium')}>
                          {fromName}
                        </span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(email.date)}
                        </span>
                      </div>
                      <div className={cn('text-sm truncate', !isRead && 'font-medium')}>
                        {email.subject || '(no subject)'}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {truncate(email.previewText, 80)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}
