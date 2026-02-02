# IMAP Browser

A polished, secure, open-source web client for managing multiple IMAP email accounts.

## Current Status

**Phases 1-7 implemented** - Foundation, Authentication, IMAP Integration, Email UI, Email Actions, Compose with Rich Text Editor, and Settings are all in place. All packages build successfully.

## Quick Start

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Development mode (runs both server and client)
npm run dev

# Or run separately:
cd packages/server && npm run dev  # Server on port 3000
cd packages/client && npm run dev  # Client on port 5173
```

## Project Structure

```
imap-browser/
├── packages/
│   ├── shared/           # Shared TypeScript types and Zod schemas
│   │   └── src/types/    # User, Account, Email, Folder, Settings types
│   │
│   ├── server/           # Fastify backend
│   │   └── src/
│   │       ├── db/       # Drizzle ORM schema and database
│   │       ├── services/ # Business logic
│   │       │   ├── auth/ # Authentication, encryption
│   │       │   ├── imap/ # Connection pool, sync
│   │       │   ├── smtp/ # Email sending
│   │       │   └── email/# Email operations
│   │       ├── routes/   # REST API endpoints
│   │       └── websocket/# Real-time updates
│   │
│   └── client/           # React frontend
│       └── src/
│           ├── components/
│           │   ├── layout/   # AppLayout, Sidebar, Header
│           │   ├── accounts/ # AddAccountDialog
│           │   ├── emails/   # EmailList, EmailView, EmailToolbar
│           │   ├── compose/  # ComposeDialog, RichTextEditor
│           │   └── search/   # SearchBar
│           ├── hooks/        # React Query hooks
│           ├── stores/       # Zustand state
│           └── pages/        # Login, Mail, Settings pages
│
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Technology Stack

### Backend
- **Fastify** - Fast HTTP framework
- **Drizzle ORM** - Type-safe SQL with SQLite
- **ImapFlow** - Modern IMAP client with IDLE support
- **Nodemailer** - SMTP for sending emails
- **Argon2** - Password hashing
- **AES-256-GCM** - Credential encryption

### Frontend
- **React 18** with TypeScript
- **Vite** - Build tool
- **TanStack Query** - Server state management
- **TanStack Virtual** - Virtualized lists (60fps scrolling)
- **Zustand** - Client state
- **shadcn/ui + Radix UI** - Accessible components
- **Tailwind CSS** - Styling
- **TipTap** - Rich text editor for compose

## Architecture

### Security Model
1. User passwords are hashed with Argon2id
2. Each user has a unique encryption salt
3. IMAP/SMTP credentials are encrypted with AES-256-GCM using a key derived from the user's password
4. Sessions use HttpOnly, Secure, SameSite=Strict cookies
5. Auth cookie expires in 15 minutes (auto-refreshed)

### Database Schema (SQLite)
- `users` - User accounts
- `sessions` - Server-side sessions
- `accounts` - IMAP accounts (encrypted credentials)
- `folders` - Synced folder structure
- `messages` - Email headers (body fetched on demand)
- `message_bodies` - Full email content (lazy loaded)
- `attachments` - Attachment metadata
- `drafts` - Local drafts
- `draft_attachments` - Uploaded attachments
- `settings` - User preferences

### API Endpoints

```
POST   /api/auth/register    - Create account
POST   /api/auth/login       - Login
POST   /api/auth/logout      - Logout
GET    /api/auth/me          - Current user
PATCH  /api/auth/me          - Update profile

GET    /api/accounts         - List IMAP accounts
POST   /api/accounts         - Add account
GET    /api/accounts/:id     - Get account
PATCH  /api/accounts/:id     - Update account
DELETE /api/accounts/:id     - Delete account
GET    /api/accounts/:id/folders - List folders
POST   /api/accounts/:id/sync    - Sync folders

GET    /api/accounts/:id/folders/:fid/emails - List emails
GET    /api/accounts/:id/emails/:eid         - Get email
POST   /api/accounts/:id/emails/flags        - Update flags
POST   /api/accounts/:id/emails/move         - Move emails
POST   /api/accounts/:id/emails/delete       - Delete emails

POST   /api/send             - Send email
POST   /api/drafts           - Save draft
GET    /api/drafts           - List drafts
POST   /api/attachments      - Upload attachment

GET    /api/settings         - Get settings
PATCH  /api/settings         - Update settings

WS     /ws                   - WebSocket for real-time updates
```

## Environment Variables

```bash
# Server
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
DATABASE_PATH=./data/imap-browser.db
COOKIE_SECRET=change-me-in-production-to-a-random-32-char-string
CORS_ORIGIN=http://localhost:5173
```

## Docker Deployment

```bash
# Build and run
docker-compose up -d

# Or build manually
docker build -t imap-browser .
docker run -p 3000:3000 -v imap-data:/app/data imap-browser
```

## Implementation Phases

- [x] **Phase 1**: Monorepo setup, shared types, database schema
- [x] **Phase 2**: Authentication, encryption, sessions
- [x] **Phase 3**: IMAP connection pool, folder sync, message fetching
- [x] **Phase 4**: Email UI (list, view, compose)
- [x] **Phase 5**: Email actions (flag, move, delete, search)
- [x] **Phase 6**: SMTP sending, rich text editor (TipTap)
- [x] **Phase 7**: Settings page with full preferences UI
- [ ] **Phase 8**: Testing, performance optimization, offline caching

## Key Files Reference

| File | Purpose |
|------|---------|
| `packages/shared/src/types/*.ts` | All TypeScript types and Zod schemas |
| `packages/server/src/db/schema.ts` | Database schema |
| `packages/server/src/services/auth/encryption-service.ts` | AES-256-GCM encryption |
| `packages/server/src/services/imap/connection-pool.ts` | IMAP connection management |
| `packages/server/src/services/imap/sync-service.ts` | Folder and message sync |
| `packages/client/src/components/emails/EmailList.tsx` | Virtualized email list |
| `packages/client/src/components/emails/EmailToolbar.tsx` | Bulk email actions |
| `packages/client/src/components/compose/RichTextEditor.tsx` | TipTap rich text editor |
| `packages/client/src/components/search/SearchBar.tsx` | Email search with instant results |
| `packages/client/src/pages/SettingsPage.tsx` | Settings UI |
| `packages/client/src/hooks/use-*.ts` | React Query hooks |
| `packages/client/src/stores/*.ts` | Zustand stores |

## Features

- Multi-account IMAP support
- Secure credential storage (encrypted per-user)
- Real-time updates via WebSocket + IMAP IDLE
- Virtualized email list (handles large mailboxes)
- Keyboard shortcuts (Gmail-like)
- Dark mode support
- Responsive design
- Rich text compose with TipTap editor
- File attachments with drag & drop
- Reply/Reply All/Forward
- Bulk email actions (mark read/unread, star, archive, delete, move)
- Instant email search
- Comprehensive settings page

## Contributing

1. Run `npm install` to install dependencies
2. Run `npm run build` to verify everything compiles
3. Run `npm run dev` to start development servers
4. Add tests in `packages/*/src/__tests__/`

## License

MIT
