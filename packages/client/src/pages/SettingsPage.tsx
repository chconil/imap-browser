import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSettingsStore } from '@/stores/settings-store';
import { useSettings, useUpdateSettings } from '@/hooks/use-settings';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, Save } from 'lucide-react';

const settingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  navigationMode: z.enum(['dropdown', 'tree']),
  emailsPerPage: z.number().min(10).max(200),
  previewLines: z.number().min(0).max(5),
  defaultSignature: z.string(),
  replyQuotePosition: z.enum(['top', 'bottom']),
  enableDesktopNotifications: z.boolean(),
  enableSoundNotifications: z.boolean(),
  autoSyncInterval: z.number().min(1).max(60),
  autoLockTimeout: z.number().min(5).max(120),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

export function SettingsPage() {
  const { theme, setTheme, navigationMode, setNavigationMode } = useSettingsStore();
  const { data: serverSettings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      theme: 'system',
      navigationMode: 'dropdown',
      emailsPerPage: 50,
      previewLines: 2,
      defaultSignature: '',
      replyQuotePosition: 'top',
      enableDesktopNotifications: true,
      enableSoundNotifications: false,
      autoSyncInterval: 5,
      autoLockTimeout: 15,
    },
  });

  // Load server settings into form
  useEffect(() => {
    if (serverSettings) {
      form.reset({
        theme: theme,
        navigationMode: navigationMode,
        emailsPerPage: serverSettings.emailsPerPage,
        previewLines: serverSettings.previewLines,
        defaultSignature: serverSettings.defaultSignature,
        replyQuotePosition: serverSettings.replyQuotePosition,
        enableDesktopNotifications: serverSettings.enableDesktopNotifications,
        enableSoundNotifications: serverSettings.enableSoundNotifications,
        autoSyncInterval: serverSettings.autoSyncInterval,
        autoLockTimeout: serverSettings.autoLockTimeout,
      });
    }
  }, [serverSettings, theme, navigationMode, form]);

  const onSubmit = async (data: SettingsFormData) => {
    // Update local settings
    setTheme(data.theme);
    setNavigationMode(data.navigationMode);

    // Update server settings
    await updateSettings.mutateAsync({
      emailsPerPage: data.emailsPerPage,
      previewLines: data.previewLines,
      defaultSignature: data.defaultSignature,
      replyQuotePosition: data.replyQuotePosition,
      enableDesktopNotifications: data.enableDesktopNotifications,
      enableSoundNotifications: data.enableSoundNotifications,
      autoSyncInterval: data.autoSyncInterval,
      autoLockTimeout: data.autoLockTimeout,
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="h-full flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="h-full overflow-auto">
        <div className="max-w-3xl mx-auto p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-muted-foreground">
              Manage your preferences and account settings
            </p>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Appearance */}
            <Card>
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>
                  Customize how the app looks and feels
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Theme</Label>
                    <p className="text-sm text-muted-foreground">
                      Select your preferred color scheme
                    </p>
                  </div>
                  <Select
                    value={form.watch('theme')}
                    onValueChange={(value) =>
                      form.setValue('theme', value as 'light' | 'dark' | 'system')
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Navigation Mode</Label>
                    <p className="text-sm text-muted-foreground">
                      Choose how to navigate between accounts
                    </p>
                  </div>
                  <Select
                    value={form.watch('navigationMode')}
                    onValueChange={(value) =>
                      form.setValue('navigationMode', value as 'dropdown' | 'tree')
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dropdown">Dropdown</SelectItem>
                      <SelectItem value="tree">Tree View</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Email Display */}
            <Card>
              <CardHeader>
                <CardTitle>Email Display</CardTitle>
                <CardDescription>
                  Configure how emails are displayed
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Emails per Page</Label>
                    <p className="text-sm text-muted-foreground">
                      Number of emails to load at a time
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={10}
                    max={200}
                    className="w-24"
                    {...form.register('emailsPerPage', { valueAsNumber: true })}
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Preview Lines</Label>
                    <p className="text-sm text-muted-foreground">
                      Lines of preview text to show in email list
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    className="w-24"
                    {...form.register('previewLines', { valueAsNumber: true })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Compose */}
            <Card>
              <CardHeader>
                <CardTitle>Compose</CardTitle>
                <CardDescription>
                  Default settings for composing emails
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Default Signature</Label>
                  <Textarea
                    placeholder="Your email signature..."
                    rows={4}
                    {...form.register('defaultSignature')}
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Reply Quote Position</Label>
                    <p className="text-sm text-muted-foreground">
                      Where to place quoted text when replying
                    </p>
                  </div>
                  <Select
                    value={form.watch('replyQuotePosition')}
                    onValueChange={(value) =>
                      form.setValue('replyQuotePosition', value as 'top' | 'bottom')
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="top">Top</SelectItem>
                      <SelectItem value="bottom">Bottom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Notifications */}
            <Card>
              <CardHeader>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>
                  Manage notification preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Desktop Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Show browser notifications for new emails
                    </p>
                  </div>
                  <Switch
                    checked={form.watch('enableDesktopNotifications')}
                    onCheckedChange={(checked: boolean) =>
                      form.setValue('enableDesktopNotifications', checked)
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Sound Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Play a sound for new emails
                    </p>
                  </div>
                  <Switch
                    checked={form.watch('enableSoundNotifications')}
                    onCheckedChange={(checked: boolean) =>
                      form.setValue('enableSoundNotifications', checked)
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* Sync & Security */}
            <Card>
              <CardHeader>
                <CardTitle>Sync & Security</CardTitle>
                <CardDescription>
                  Configure synchronization and security settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Auto-sync Interval</Label>
                    <p className="text-sm text-muted-foreground">
                      Minutes between automatic email checks
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      className="w-20"
                      {...form.register('autoSyncInterval', { valueAsNumber: true })}
                    />
                    <span className="text-sm text-muted-foreground">min</span>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Auto-lock Timeout</Label>
                    <p className="text-sm text-muted-foreground">
                      Lock the app after inactivity
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={5}
                      max={120}
                      className="w-20"
                      {...form.register('autoLockTimeout', { valueAsNumber: true })}
                    />
                    <span className="text-sm text-muted-foreground">min</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Save button */}
            <div className="flex justify-end">
              <Button type="submit" disabled={updateSettings.isPending}>
                {updateSettings.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Settings
              </Button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
