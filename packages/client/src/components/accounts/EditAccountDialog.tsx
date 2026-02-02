import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUpdateAccount } from '@/hooks/use-accounts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { Account } from '@imap-browser/shared';

const editAccountSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  imapHost: z.string().min(1, 'IMAP host is required'),
  imapPort: z.coerce.number().int().min(1).max(65535),
  imapSecurity: z.enum(['tls', 'starttls', 'none']),
  imapPassword: z.string().optional(),
  smtpHost: z.string().min(1, 'SMTP host is required'),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpSecurity: z.enum(['tls', 'starttls', 'none']),
  smtpPassword: z.string().optional(),
});

type EditAccountFormData = z.infer<typeof editAccountSchema>;

interface EditAccountDialogProps {
  account: Account | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditAccountDialog({ account, open, onOpenChange }: EditAccountDialogProps) {
  const updateAccount = useUpdateAccount();

  const form = useForm<EditAccountFormData>({
    resolver: zodResolver(editAccountSchema),
    defaultValues: {
      name: '',
      imapHost: '',
      imapPort: 993,
      imapSecurity: 'tls',
      imapPassword: '',
      smtpHost: '',
      smtpPort: 587,
      smtpSecurity: 'starttls',
      smtpPassword: '',
    },
  });

  // Reset form when account changes
  useEffect(() => {
    if (account) {
      form.reset({
        name: account.name,
        imapHost: account.imapHost,
        imapPort: account.imapPort,
        imapSecurity: account.imapSecurity,
        imapPassword: '',
        smtpHost: account.smtpHost,
        smtpPort: account.smtpPort,
        smtpSecurity: account.smtpSecurity,
        smtpPassword: '',
      });
    }
  }, [account, form]);

  const onSubmit = async (data: EditAccountFormData) => {
    if (!account) return;

    try {
      await updateAccount.mutateAsync({
        accountId: account.id,
        input: {
          name: data.name,
          imapHost: data.imapHost,
          imapPort: data.imapPort,
          imapSecurity: data.imapSecurity,
          imapPassword: data.imapPassword || undefined,
          smtpHost: data.smtpHost,
          smtpPort: data.smtpPort,
          smtpSecurity: data.smtpSecurity,
          smtpPassword: data.smtpPassword || undefined,
        },
      });
      onOpenChange(false);
    } catch (error) {
      // Error will be shown via form state
      console.error('Failed to update account:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" onInteractOutside={(e) => e.preventDefault()}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
            <DialogDescription>
              Update your email account settings. Leave password fields empty to keep existing passwords.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Account name */}
            <div className="grid gap-2">
              <Label htmlFor="name">Account Name</Label>
              <Input
                id="name"
                placeholder="My Email"
                {...form.register('name')}
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            {/* Email (read-only) */}
            {account && (
              <div className="grid gap-2">
                <Label>Email</Label>
                <Input value={account.email} disabled />
              </div>
            )}

            {/* IMAP Settings */}
            <div className="space-y-2">
              <Label className="text-base font-medium">IMAP Settings</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="imapHost" className="text-xs">Host</Label>
                  <Input
                    id="imapHost"
                    placeholder="imap.example.com"
                    {...form.register('imapHost')}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="imapPort" className="text-xs">Port</Label>
                    <Input
                      id="imapPort"
                      type="number"
                      {...form.register('imapPort')}
                    />
                  </div>
                  <div>
                    <Label htmlFor="imapSecurity" className="text-xs">Security</Label>
                    <Select
                      value={form.watch('imapSecurity')}
                      onValueChange={(value) => form.setValue('imapSecurity', value as 'tls' | 'starttls' | 'none')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tls">TLS</SelectItem>
                        <SelectItem value="starttls">STARTTLS</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div>
                <Label htmlFor="imapPassword" className="text-xs">New Password (leave empty to keep current)</Label>
                <PasswordInput
                  id="imapPassword"
                  placeholder="••••••••"
                  {...form.register('imapPassword')}
                />
              </div>
            </div>

            {/* SMTP Settings */}
            <div className="space-y-2">
              <Label className="text-base font-medium">SMTP Settings</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="smtpHost" className="text-xs">Host</Label>
                  <Input
                    id="smtpHost"
                    placeholder="smtp.example.com"
                    {...form.register('smtpHost')}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="smtpPort" className="text-xs">Port</Label>
                    <Input
                      id="smtpPort"
                      type="number"
                      {...form.register('smtpPort')}
                    />
                  </div>
                  <div>
                    <Label htmlFor="smtpSecurity" className="text-xs">Security</Label>
                    <Select
                      value={form.watch('smtpSecurity')}
                      onValueChange={(value) => form.setValue('smtpSecurity', value as 'tls' | 'starttls' | 'none')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tls">TLS</SelectItem>
                        <SelectItem value="starttls">STARTTLS</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div>
                <Label htmlFor="smtpPassword" className="text-xs">New Password (leave empty to keep current)</Label>
                <PasswordInput
                  id="smtpPassword"
                  placeholder="••••••••"
                  {...form.register('smtpPassword')}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateAccount.isPending}>
              {updateAccount.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
