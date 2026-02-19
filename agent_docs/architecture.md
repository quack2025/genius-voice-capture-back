# Architecture — Voice Capture API (Backend)

## System Overview

```
Widget (voice.js) ─POST /api/transcribe──> Backend ──Whisper API──> DB (text only)
                                              |
                                              v (if Whisper fails 3x)
                                         Supabase Storage (fallback)

Dashboard (frontend) ──read──> Supabase (projects, recordings)
Dashboard ──API calls──> Backend (export, retranscribe, admin, chat, org)
```

- Audio processed in memory (buffer), never stored on success
- Only transcription text saved to DB
- If Whisper fails 3x, audio uploaded to Storage as fallback (status: failed)
- Fallback recordings can be retranscribed from dashboard

## API Endpoints

### Widget (no JWT, uses x-project-key)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/health` | none | Health check (first route, before all middleware) |
| GET | `/voice.js` | none | Embeddable widget (static JS, serves minified in prod) |
| POST | `/api/transcribe` | x-project-key | Immediate transcription from audio buffer |
| POST | `/api/upload` | x-project-key | Legacy upload (stores audio) |
| POST | `/api/text-response` | x-project-key | Text-only response (no audio) |
| GET | `/api/widget-config/:projectKey` | none | Widget dynamic config (branding, duration) |

### Dashboard (JWT via Supabase Auth)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/projects` | List user's projects |
| POST | `/api/projects` | Create project (enforces plan limit) |
| GET | `/api/projects/:id` | Project detail |
| PUT | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project + recordings |
| GET | `/api/projects/:id/recordings` | List recordings (paginated) |
| GET | `/api/projects/:id/recordings/:rid` | Recording detail |
| POST | `/api/projects/:id/recordings/:rid/retranscribe` | Retranscribe (needs audio_path) |
| GET | `/api/projects/:id/export` | Export CSV streaming |

### Account

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/account/usage` | Profile + plan + usage + org info + limits |

### Organizations

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/org` | Get user's org |
| POST | `/api/org/invite` | Invite member by email |
| DELETE | `/api/org/members/:userId` | Remove member |
| POST | `/api/org/leave` | Leave org |

### AI Help Chat

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/chat/conversations` | List user's conversations |
| POST | `/api/chat/conversations` | Create conversation |
| GET | `/api/chat/conversations/:id` | Get messages + remaining_today |
| POST | `/api/chat/message` | Send message (checks daily limit, calls Claude) |
| POST | `/api/chat/upload-image` | Upload image to Supabase Storage |

### Super Admin (requireAdmin middleware)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/admin/stats` | Platform stats (users, projects, recordings, by plan) |
| GET | `/api/admin/users` | Paginated user list with search |
| GET | `/api/admin/users/:id` | User detail + projects + usage history |
| PUT | `/api/admin/users/:id/plan` | Change user plan |
| DELETE | `/api/admin/users/:id` | Delete user + cascade all data |
| PUT | `/api/admin/users/:id/admin` | Toggle admin status |
| POST | `/api/admin/users/:id/reset-password` | Send password reset email |
| GET | `/api/admin/orgs` | List all organizations |
| POST | `/api/admin/orgs` | Create organization |
| GET | `/api/admin/orgs/:id` | Org detail + members + usage |
| PUT | `/api/admin/orgs/:id` | Edit org (name, plan, maxSeats) |
| DELETE | `/api/admin/orgs/:id` | Delete org + unlink members |

## Auth Flows

### Widget Auth (x-project-key)
1. Widget sends `x-project-key: proj_xxx` header
2. `projectKey.js` middleware looks up project by `public_key`
3. Sets `req.project` with project data

### Dashboard Auth (JWT)
1. Frontend gets JWT from Supabase Auth
2. Sends `Authorization: Bearer <token>`
3. `auth.js` middleware validates via `supabase.auth.getUser(token)`
4. Sets `req.user` with `{ id, email }`

### Admin Auth
1. `adminAuth.js` composes `requireAuth` + checks `is_admin` on `user_profiles`
2. Prevents self-deletion and self-admin-removal

## Data Model

### user_profiles
```sql
id (UUID, PK, FK -> auth.users)
email (TEXT)
plan (VARCHAR 20, default 'free')
plan_name (TEXT)
plan_started_at (TIMESTAMPTZ)
is_admin (BOOLEAN, default false)
org_id (UUID, FK -> organizations, nullable)
org_role (VARCHAR 20, nullable) -- 'owner' | 'member'
created_at (TIMESTAMPTZ)
```

### projects
```sql
id (UUID, PK)
user_id (UUID, FK -> auth.users)
name (VARCHAR 255)
public_key (VARCHAR 50)       -- proj_xxx for widget
language (VARCHAR 5)           -- 'es', 'en', 'pt'
transcription_mode (VARCHAR 20) -- always 'realtime'
settings (JSONB)
created_at, updated_at (TIMESTAMPTZ)
```

### recordings
```sql
id (UUID, PK)
project_id (UUID, FK -> projects)
session_id (VARCHAR 100)
question_id (VARCHAR 50)
audio_path (TEXT, nullable)    -- null/'transcribed-immediate' = success, path = fallback
audio_size_bytes (INTEGER)
duration_seconds (INTEGER)
transcription (TEXT)
previous_transcription (TEXT)
language_detected (VARCHAR 5)
status (VARCHAR 20)            -- pending|processing|completed|failed
error_message (TEXT)
metadata (JSONB)
created_at, transcribed_at (TIMESTAMPTZ)
```

### usage
```sql
user_id (UUID, FK -> auth.users)
month (VARCHAR 7)              -- '2026-02'
responses_count (INTEGER)
PRIMARY KEY (user_id, month)
```

### organizations
```sql
id (UUID, PK)
name (TEXT)
plan (VARCHAR 20)
plan_name (TEXT)
max_seats (INTEGER)
max_responses (INTEGER)
owner_id (UUID, FK -> auth.users)
created_at (TIMESTAMPTZ)
```

### org_usage
```sql
org_id (UUID, FK -> organizations)
month (VARCHAR 7)
responses_count (INTEGER)
PRIMARY KEY (org_id, month)
```

### chat_conversations
```sql
id (UUID, PK)
user_id (UUID, FK -> auth.users)
title (TEXT)
created_at, updated_at (TIMESTAMPTZ)
```

### chat_messages
```sql
id (UUID, PK)
conversation_id (UUID, FK -> chat_conversations ON DELETE CASCADE)
role (VARCHAR 20)             -- 'user' | 'assistant'
content (TEXT)
image_url (TEXT, nullable)
created_at (TIMESTAMPTZ)
```

### chat_daily_usage
```sql
user_id (UUID, FK -> auth.users)
date (DATE)
messages_count (INTEGER)
PRIMARY KEY (user_id, date)
```

## Widget voice.js

Standalone IIFE widget (vanilla JS) for embedding in Alchemer surveys.

- **Shadow DOM** (closed mode) for CSS isolation
- **MediaRecorder API** (WebM/Opus preferred, MP4 fallback)
- Internal i18n (es/en/pt) via `data-lang`
- States: idle → recording → uploading → success → error
- Auto-detects API URL from script origin
- Multiple widgets per page (one per question)
- Auto-writes transcription to survey answer field

### Container Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| data-project | Yes | Project key (proj_xxx) |
| data-session | No | Session ID (fallback: URL param sguid/snc) |
| data-question | No | Question ID |
| data-lang | No | Language: es (default), en, pt |
| data-max-duration | No | Max seconds (default: 120) |
| data-api | No | API URL (auto-detected) |
| data-target | No | CSS selector for target input field |

### Alchemer Integration Pattern (3 steps)

1. **Custom HEAD**: `<script src="https://voice-capture-api-production.up.railway.app/voice.js" defer></script>`
2. **Question Text**: Only text, NO divs (Alchemer strips data-* attributes)
3. **JavaScript Action**: Create div dynamically, set attributes via `setAttribute()`, insert between title and options (outside the `<label>`)

## Whisper Service

```
transcribeFromBuffer(buffer, extension='webm', language='es')
  → 2 retries, exponential backoff + jitter, 30s timeout
  → Returns { text, language, duration }
  → Cost: ~$0.006/min

transcribeAudio(audioPath, language)
  → Downloads from Storage, delegates to transcribeFromBuffer
```

## AI Chat Service

- Model: Claude Haiku 4.5 (`claude-haiku-4-5-20251001`)
- Non-streaming (REST pattern consistent with existing API)
- System prompt includes full platform knowledge base (widget setup, Alchemer integration, plans, troubleshooting)
- Dynamic user context injection (plan, usage, projects, current page, org, language)
- Image support: download from Supabase signed URL → base64 → Claude image content block
- Daily limit per plan enforced via `chat_daily_usage` table
- Auto-titles conversations after first assistant response
