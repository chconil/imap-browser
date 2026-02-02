import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateAccount, useTestConnection } from '@/hooks/use-accounts';
import { emailProviders } from '@imap-browser/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Plus, Loader2, CheckCircle2, XCircle } from 'lucide-react';

const accountSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  provider: z.string(),
  imapHost: z.string().min(1, 'IMAP host is required'),
  imapPort: z.coerce.number().int().min(1).max(65535),
  imapSecurity: z.enum(['tls', 'starttls', 'none']),
  imapUsername: z.string().min(1, 'Username is required'),
  imapPassword: z.string().min(1, 'Password is required'),
  smtpHost: z.string().min(1, 'SMTP host is required'),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpSecurity: z.enum(['tls', 'starttls', 'none']),
});

type AccountFormData = z.infer<typeof accountSchema>;

export function AddAccountDialog() {
  const [open, setOpen] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState<string | null>(null);

  const createAccount = useCreateAccount();
  const testConnection = useTestConnection();

  const form = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: '',
      email: '',
      provider: 'custom',
      imapHost: '',
      imapPort: 993,
      imapSecurity: 'tls',
      imapUsername: '',
      imapPassword: '',
      smtpHost: '',
      smtpPort: 465,
      smtpSecurity: 'tls',
    },
  });

  const handleProviderChange = (provider: string) => {
    form.setValue('provider', provider);
    if (provider !== 'custom' && provider in emailProviders) {
      const preset = emailProviders[provider as keyof typeof emailProviders];
      form.setValue('imapHost', preset.imapHost);
      form.setValue('imapPort', preset.imapPort);
      form.setValue('imapSecurity', preset.imapSecurity);
      form.setValue('smtpHost', preset.smtpHost);
      form.setValue('smtpPort', preset.smtpPort);
      form.setValue('smtpSecurity', preset.smtpSecurity);
    }
  };

  const handleTest = async () => {
    const values = form.getValues();
    setTestStatus('testing');
    setTestError(null);

    try {
      await testConnection.mutateAsync({
        imapHost: values.imapHost,
        imapPort: values.imapPort,
        imapSecurity: values.imapSecurity,
        imapUsername: values.imapUsername,
        imapPassword: values.imapPassword,
      });
      setTestStatus('success');
    } catch (err) {
      setTestStatus('error');
      setTestError(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  const onSubmit = async (data: AccountFormData) => {
    try {
      await createAccount.mutateAsync({
        name: data.name,
        email: data.email,
        imapHost: data.imapHost,
        imapPort: data.imapPort,
        imapSecurity: data.imapSecurity,
        imapUsername: data.imapUsername,
        imapPassword: data.imapPassword,
        smtpHost: data.smtpHost,
        smtpPort: data.smtpPort,
        smtpSecurity: data.smtpSecurity,
      });
      setOpen(false);
      form.reset();
      setTestStatus('idle');
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Account
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Add Email Account</DialogTitle>
            <DialogDescription>
              Connect an IMAP email account. For Gmail/Outlook, use an App Password.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Account name */}
            <div className="grid gap-2">
              <Label htmlFor="name">Account Name</Label>
              <Input
                id="name"
                placeholder="Personal Email"
                {...form.register('name')}
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            {/* Email */}
            <div className="grid gap-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                {...form.register('email')}
              />
            </div>

            {/* Provider preset */}
            <div className="grid gap-2">
              <Label>Email Provider</Label>
              <Select
                value={form.watch('provider')}
                onValueChange={handleProviderChange}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom</SelectItem>
                  <SelectItem value="gmail">Gmail</SelectItem>
                  <SelectItem value="outlook">Outlook/Microsoft 365</SelectItem>
                  <SelectItem value="yahoo">Yahoo</SelectItem>
                  <SelectItem value="icloud">iCloud</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* IMAP Settings */}
            <div className="border rounded-md p-3 space-y-3">
              <h4 className="text-sm font-medium">IMAP Settings</h4>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="imapHost">Host</Label>
                  <Input id="imapHost" {...form.register('imapHost')} />
                </div>
                <div>
                  <Label htmlFor="imapPort">Port</Label>
                  <Input id="imapPort" type="number" {...form.register('imapPort')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="imapUsername">Username</Label>
                  <Input id="imapUsername" {...form.register('imapUsername')} />
                </div>
                <div>
                  <Label htmlFor="imapPassword">Password</Label>
                  <PasswordInput id="imapPassword" {...form.register('imapPassword')} />
                </div>
              </div>
            </div>

            {/* SMTP Settings */}
            <div className="border rounded-md p-3 space-y-3">
              <h4 className="text-sm font-medium">SMTP Settings</h4>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="smtpHost">Host</Label>
                  <Input id="smtpHost" {...form.register('smtpHost')} />
                </div>
                <div>
                  <Label htmlFor="smtpPort">Port</Label>
                  <Input id="smtpPort" type="number" {...form.register('smtpPort')} />
                </div>
              </div>
            </div>

            {/* Test connection */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleTest}
                disabled={testStatus === 'testing'}
              >
                {testStatus === 'testing' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Test Connection
              </Button>
              {testStatus === 'success' && (
                <span className="flex items-center text-green-600 text-sm">
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Connected
                </span>
              )}
              {testStatus === 'error' && (
                <span className="flex items-center text-destructive text-sm">
                  <XCircle className="h-4 w-4 mr-1" />
                  {testError}
                </span>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createAccount.isPending}>
              {createAccount.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
