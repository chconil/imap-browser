import type {
  User,
  CreateUserInput,
  LoginInput,
  UpdateUserInput,
  Account,
  CreateAccountInput,
  UpdateAccountInput,
  Folder,
  EmailHeader,
  Email,
  EmailListResponse,
  Draft,
  SaveDraftInput,
  ComposeEmailInput,
  UserSettings,
  UpdateSettingsInput,
  AutoconfigResult,
  AutoconfigLookupInput,
} from '@imap-browser/shared';

const API_BASE = '/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

class ApiError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'ApiError';
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  const data: ApiResponse<T> = await response.json();

  if (!data.success) {
    throw new ApiError(
      data.error?.code || 'UNKNOWN_ERROR',
      data.error?.message || 'An unknown error occurred',
      data.error?.details,
    );
  }

  return data.data as T;
}

// Auth API
export const authApi = {
  register: (input: CreateUserInput) =>
    request<{ user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  login: (input: LoginInput) =>
    request<{ user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  logout: () =>
    request<void>('/auth/logout', { method: 'POST' }),

  me: () =>
    request<{ user: User }>('/auth/me'),

  update: (input: UpdateUserInput) =>
    request<{ user: User }>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  refresh: () =>
    request<void>('/auth/refresh', { method: 'POST' }),
};

// Accounts API
export const accountsApi = {
  list: () =>
    request<{ accounts: Account[] }>('/accounts'),

  get: (accountId: string) =>
    request<{ account: Account }>(`/accounts/${accountId}`),

  create: (input: CreateAccountInput) =>
    request<{ account: Account }>('/accounts', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  update: (accountId: string, input: UpdateAccountInput) =>
    request<{ account: Account }>(`/accounts/${accountId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  delete: (accountId: string) =>
    request<void>(`/accounts/${accountId}`, { method: 'DELETE' }),

  getFolders: (accountId: string) =>
    request<{ folders: Folder[] }>(`/accounts/${accountId}/folders`),

  sync: (accountId: string) =>
    request<{ folders: Folder[] }>(`/accounts/${accountId}/sync`, {
      method: 'POST',
    }),

  testConnection: (input: {
    imapHost: string;
    imapPort: number;
    imapSecurity: 'tls' | 'starttls' | 'none';
    imapUsername: string;
    imapPassword: string;
  }) =>
    request<void>('/accounts/test-connection', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  reorder: (accountIds: string[]) =>
    request<void>('/accounts/reorder', {
      method: 'POST',
      body: JSON.stringify({ accountIds }),
    }),
};

// Emails API
export const emailsApi = {
  list: (accountId: string, folderId: string, params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    sortBy?: 'date' | 'from' | 'subject' | 'size';
    sortOrder?: 'asc' | 'desc';
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.pageSize) searchParams.set('pageSize', params.pageSize.toString());
    if (params?.search) searchParams.set('search', params.search);
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);

    const query = searchParams.toString();
    return request<EmailListResponse>(
      `/accounts/${accountId}/folders/${folderId}/emails${query ? `?${query}` : ''}`,
    );
  },

  get: (accountId: string, emailId: string) =>
    request<{ email: Email }>(`/accounts/${accountId}/emails/${emailId}`),

  updateFlags: (accountId: string, emailIds: string[], addFlags?: string[], removeFlags?: string[]) =>
    request<void>(`/accounts/${accountId}/emails/flags`, {
      method: 'POST',
      body: JSON.stringify({ emailIds, addFlags, removeFlags }),
    }),

  move: (accountId: string, emailIds: string[], targetFolderId: string) =>
    request<void>(`/accounts/${accountId}/emails/move`, {
      method: 'POST',
      body: JSON.stringify({ emailIds, targetFolderId }),
    }),

  delete: (accountId: string, emailIds: string[], permanent = false) =>
    request<void>(`/accounts/${accountId}/emails/delete`, {
      method: 'POST',
      body: JSON.stringify({ emailIds, permanent }),
    }),

  search: (query: string, accountId?: string, folderId?: string) => {
    const searchParams = new URLSearchParams({ query });
    if (accountId) searchParams.set('accountId', accountId);
    if (folderId) searchParams.set('folderId', folderId);
    return request<{ emails: EmailHeader[] }>(`/emails/search?${searchParams}`);
  },

  syncFolder: (accountId: string, folderId: string) =>
    request<{ newMessages: number; updatedMessages: number }>(
      `/accounts/${accountId}/folders/${folderId}/sync`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
};

// Compose API
export const composeApi = {
  send: (input: ComposeEmailInput) =>
    request<{ messageId?: string }>('/send', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  saveDraft: (input: SaveDraftInput) =>
    request<{ draftId: string }>('/drafts', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  listDrafts: () =>
    request<{ drafts: Draft[] }>('/drafts'),

  getDraft: (draftId: string) =>
    request<{ draft: Draft }>(`/drafts/${draftId}`),

  deleteDraft: (draftId: string) =>
    request<void>(`/drafts/${draftId}`, { method: 'DELETE' }),

  uploadAttachment: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/attachments`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    const data: ApiResponse<{
      id: string;
      filename: string;
      contentType: string;
      size: number;
    }> = await response.json();

    if (!data.success || !data.data) {
      throw new ApiError(
        data.error?.code || 'UPLOAD_FAILED',
        data.error?.message || 'Failed to upload attachment',
      );
    }

    return data.data;
  },

  deleteAttachment: (attachmentId: string) =>
    request<void>(`/attachments/${attachmentId}`, { method: 'DELETE' }),
};

// Settings API
export const settingsApi = {
  get: () =>
    request<{ settings: UserSettings }>('/settings'),

  update: (input: UpdateSettingsInput) =>
    request<{ settings: UserSettings }>('/settings', {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
};

// Autoconfig API
export const autoconfigApi = {
  lookup: (input: AutoconfigLookupInput) =>
    request<AutoconfigResult>('/autoconfig/lookup', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

// Download attachment URL helper
export function getAttachmentUrl(accountId: string, attachmentId: string): string {
  return `${API_BASE}/accounts/${accountId}/attachments/${attachmentId}`;
}

export { ApiError };
