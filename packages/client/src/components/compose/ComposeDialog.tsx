import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMailStore } from '@/stores/mail-store';
import { useAccounts } from '@/hooks/use-accounts';
import { useSendEmail, useUploadAttachment, useDeleteAttachment } from '@/hooks/use-compose';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Send, Paperclip, Loader2, Trash2 } from 'lucide-react';
import { formatFileSize } from '@/lib/utils';

const composeSchema = z.object({
  accountId: z.string().min(1, 'Select an account'),
  to: z.string().min(1, 'At least one recipient is required'),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  subject: z.string(),
  body: z.string(),
});

type ComposeFormData = z.infer<typeof composeSchema>;

interface UploadedAttachment {
  id: string;
  filename: string;
  size: number;
}

export function ComposeDialog() {
  const { isComposeOpen, closeCompose, composeMode, replyToEmail, selectedAccountId } = useMailStore();
  const { data: accounts = [] } = useAccounts();
  const sendEmail = useSendEmail();
  const uploadAttachment = useUploadAttachment();
  const deleteAttachment = useDeleteAttachment();

  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const form = useForm<ComposeFormData>({
    resolver: zodResolver(composeSchema),
    defaultValues: {
      accountId: selectedAccountId || '',
      to: '',
      cc: '',
      bcc: '',
      subject: '',
      body: '',
    },
  });

  // Set up form for reply/forward
  useEffect(() => {
    if (isComposeOpen && replyToEmail) {
      if (composeMode === 'reply' || composeMode === 'reply-all') {
        const fromAddr = replyToEmail.from[0]?.address || '';
        form.setValue('to', fromAddr);
        form.setValue('subject', `Re: ${replyToEmail.subject}`);

        if (composeMode === 'reply-all') {
          const ccAddrs = [
            ...replyToEmail.to.map(a => a.address),
            ...replyToEmail.cc.map(a => a.address),
          ].filter(a => a !== fromAddr).join(', ');
          form.setValue('cc', ccAddrs);
        }
      } else if (composeMode === 'forward') {
        form.setValue('subject', `Fwd: ${replyToEmail.subject}`);
      }
    }
    if (selectedAccountId) {
      form.setValue('accountId', selectedAccountId);
    }
  }, [isComposeOpen, composeMode, replyToEmail, selectedAccountId, form]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const result = await uploadAttachment.mutateAsync(file);
        setAttachments(prev => [...prev, {
          id: result.id,
          filename: result.filename,
          size: result.size,
        }]);
      }
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoveAttachment = async (attachmentId: string) => {
    await deleteAttachment.mutateAsync(attachmentId);
    setAttachments(prev => prev.filter(a => a.id !== attachmentId));
  };

  const parseAddresses = (str: string) => {
    return str.split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(address => ({ address }));
  };

  const onSubmit = async (data: ComposeFormData) => {
    try {
      await sendEmail.mutateAsync({
        accountId: data.accountId,
        to: parseAddresses(data.to),
        cc: data.cc ? parseAddresses(data.cc) : [],
        bcc: data.bcc ? parseAddresses(data.bcc) : [],
        subject: data.subject,
        textBody: data.body,
        attachmentIds: attachments.map(a => a.id),
        inReplyTo: replyToEmail?.messageId || null,
        references: [],
      });
      form.reset();
      setAttachments([]);
    } catch {
      // Error handled by mutation
    }
  };

  const handleClose = () => {
    closeCompose();
    form.reset();
    setAttachments([]);
  };

  return (
    <Dialog open={isComposeOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            {composeMode === 'reply' && 'Reply'}
            {composeMode === 'reply-all' && 'Reply All'}
            {composeMode === 'forward' && 'Forward'}
            {composeMode === 'new' && 'New Email'}
            {!composeMode && 'Compose'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col min-h-0">
          <div className="space-y-3 flex-shrink-0">
            {/* Account selector */}
            <div className="flex items-center gap-2">
              <Label className="w-16">From</Label>
              <Select
                value={form.watch('accountId')}
                onValueChange={(value) => form.setValue('accountId', value)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} ({account.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* To */}
            <div className="flex items-center gap-2">
              <Label className="w-16">To</Label>
              <Input
                placeholder="recipient@example.com"
                {...form.register('to')}
                className="flex-1"
              />
            </div>

            {/* Cc */}
            <div className="flex items-center gap-2">
              <Label className="w-16">Cc</Label>
              <Input
                placeholder="cc@example.com"
                {...form.register('cc')}
                className="flex-1"
              />
            </div>

            {/* Subject */}
            <div className="flex items-center gap-2">
              <Label className="w-16">Subject</Label>
              <Input
                placeholder="Subject"
                {...form.register('subject')}
                className="flex-1"
              />
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 my-3">
            <textarea
              placeholder="Write your message..."
              {...form.register('body')}
              className="w-full h-full min-h-[200px] p-3 rounded-md border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3 flex-shrink-0">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-sm"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  <span>{att.filename}</span>
                  <span className="text-muted-foreground">({formatFileSize(att.size)})</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(att.id)}
                    className="p-0.5 hover:bg-background rounded"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-2 pt-3 border-t flex-shrink-0">
            <Button type="submit" disabled={sendEmail.isPending}>
              {sendEmail.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send
            </Button>

            <label className="cursor-pointer">
              <input
                type="file"
                multiple
                className="hidden"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
              <Button type="button" variant="outline" asChild disabled={isUploading}>
                <span>
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Paperclip className="h-4 w-4 mr-2" />
                  )}
                  Attach
                </span>
              </Button>
            </label>

            <div className="flex-1" />

            <Button type="button" variant="ghost" onClick={handleClose}>
              <Trash2 className="h-4 w-4 mr-2" />
              Discard
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
