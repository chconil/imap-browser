import { useMemo } from 'react';
import { useMailStore } from '@/stores/mail-store';
import { useEmail, useUpdateFlags, useDeleteEmails } from '@/hooks/use-emails';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Reply,
  ReplyAll,
  Forward,
  Trash2,
  Archive,
  Star,
  MailOpen,
  Mail,
  Paperclip,
  Download,
  X,
} from 'lucide-react';
import { formatDate, formatFileSize, getInitials } from '@/lib/utils';
import { getAttachmentUrl } from '@/lib/api';
import DOMPurify from 'dompurify';

export function EmailView() {
  const {
    selectedAccountId,
    selectedEmailId,
    setSelectedEmail,
    openCompose,
  } = useMailStore();

  const { data: email, isLoading } = useEmail(selectedAccountId, selectedEmailId);
  const updateFlags = useUpdateFlags();
  const deleteEmails = useDeleteEmails();

  const isRead = email?.flags.includes('\\Seen') ?? false;
  const isStarred = email?.flags.includes('\\Flagged') ?? false;

  // Sanitize HTML content
  const sanitizedHtml = useMemo(() => {
    if (!email?.htmlBody) return null;
    return DOMPurify.sanitize(email.htmlBody, {
      ALLOWED_TAGS: [
        'p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
        'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'div', 'span',
        'hr', 'sub', 'sup',
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'style', 'class', 'width', 'height'],
      ALLOW_DATA_ATTR: false,
    });
  }, [email?.htmlBody]);

  // Mark as read when viewing
  // useEffect(() => {
  //   if (email && !isRead && selectedAccountId) {
  //     updateFlags.mutate({
  //       accountId: selectedAccountId,
  //       emailIds: [email.id],
  //       addFlags: ['\\Seen'],
  //     });
  //   }
  // }, [email, isRead, selectedAccountId]);

  if (!selectedEmailId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Select an email to read
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Loading email...
      </div>
    );
  }

  if (!email) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Email not found
      </div>
    );
  }

  const fromAddress = email.from[0];
  const toAddresses = email.to;

  const handleToggleRead = () => {
    if (!selectedAccountId) return;
    updateFlags.mutate({
      accountId: selectedAccountId,
      emailIds: [email.id],
      addFlags: isRead ? undefined : ['\\Seen'],
      removeFlags: isRead ? ['\\Seen'] : undefined,
    });
  };

  const handleToggleStar = () => {
    if (!selectedAccountId) return;
    updateFlags.mutate({
      accountId: selectedAccountId,
      emailIds: [email.id],
      addFlags: isStarred ? undefined : ['\\Flagged'],
      removeFlags: isStarred ? ['\\Flagged'] : undefined,
    });
  };

  const handleDelete = () => {
    if (!selectedAccountId) return;
    deleteEmails.mutate({
      accountId: selectedAccountId,
      emailIds: [email.id],
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => setSelectedEmail(null)}>
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => openCompose('reply')}>
                <Reply className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reply</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => openCompose('reply-all')}>
                <ReplyAll className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reply all</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => openCompose('forward')}>
                <Forward className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Forward</TooltipContent>
          </Tooltip>

          <div className="flex-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleToggleRead}>
                {isRead ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isRead ? 'Mark as unread' : 'Mark as read'}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleToggleStar}>
                <Star className={isStarred ? 'h-4 w-4 fill-yellow-400 text-yellow-400' : 'h-4 w-4'} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isStarred ? 'Remove star' : 'Star'}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon">
                <Archive className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Archive</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Email content */}
      <ScrollArea className="flex-1">
        <div className="p-6 max-w-4xl">
          {/* Subject */}
          <h1 className="text-2xl font-semibold mb-4">{email.subject || '(no subject)'}</h1>

          {/* Header */}
          <div className="flex items-start gap-4 mb-6">
            <Avatar className="h-10 w-10">
              <AvatarFallback>
                {getInitials(fromAddress?.name || fromAddress?.address || '?')}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-medium">
                  {fromAddress?.name || fromAddress?.address}
                </span>
                {fromAddress?.name && (
                  <span className="text-sm text-muted-foreground">
                    &lt;{fromAddress.address}&gt;
                  </span>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                To: {toAddresses.map((a) => a.name || a.address).join(', ')}
              </div>
              {email.cc.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  Cc: {email.cc.map((a) => a.name || a.address).join(', ')}
                </div>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {formatDate(email.date)}
            </div>
          </div>

          {/* Attachments */}
          {email.attachments.length > 0 && (
            <div className="mb-6 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2 text-sm font-medium">
                <Paperclip className="h-4 w-4" />
                {email.attachments.length} attachment{email.attachments.length > 1 ? 's' : ''}
              </div>
              <div className="flex flex-wrap gap-2">
                {email.attachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    href={getAttachmentUrl(selectedAccountId!, attachment.id)}
                    download={attachment.filename}
                    className="flex items-center gap-2 px-3 py-2 bg-background rounded border hover:bg-accent transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    <div>
                      <div className="text-sm font-medium">{attachment.filename}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatFileSize(attachment.size)}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Body */}
          {sanitizedHtml ? (
            <div
              className="email-content"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          ) : email.textBody ? (
            <pre className="whitespace-pre-wrap font-sans text-sm">{email.textBody}</pre>
          ) : (
            <p className="text-muted-foreground">No content</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
