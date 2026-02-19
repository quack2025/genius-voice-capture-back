# Building & Deploying — Voice Capture API (Backend)

## Environment Variables

```env
# Supabase
SUPABASE_URL=https://hggwsdqjkwydiubhvrvq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...     # Admin (bypass RLS)
SUPABASE_ANON_KEY=eyJ...             # For JWT validation only

# AI Services
OPENAI_API_KEY=sk-...                # Whisper transcription
ANTHROPIC_API_KEY=sk-ant-...         # Claude chat

# Server
PORT=3000
NODE_ENV=development                 # or 'production'
MAX_AUDIO_SIZE_MB=10
MAX_AUDIO_DURATION_SECONDS=180
```

## Local Development

```bash
npm install
npm run dev     # nodemon on port 3000
```

The dev server serves the source `voice.js` from `src/widget/voice.js`.

## Building

```bash
npm run build   # Builds minified voice.min.js into dist/
```

In production, the server serves the minified widget from `dist/voice.min.js`. If the minified file doesn't exist, it falls back to the source file.

## Testing

```bash
npm test              # Jest + Supertest
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

## Deploy to Railway

**Platform:** Railway (auto-deploy on push to `main` branch)
**URL:** https://voice-capture-api-production.up.railway.app

### Railway Setup

1. Connect GitHub repo `quack2025/genius-voice-capture`
2. Set all environment variables in Railway dashboard
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Health check: `GET /health` (returns `{ status: 'ok' }`)

### Important Railway Notes

- Railway runs behind a reverse proxy → `app.set('trust proxy', 1)` is set
- `/health` endpoint is registered BEFORE all middleware (Helmet, CORS, etc.) to ensure Railway healthcheck always works
- Auto-deploy triggers on every push to `main`

## Supabase Setup

### Required Tables

All tables use Row Level Security (RLS). The backend uses `service_role` key to bypass RLS.

Core tables: `user_profiles`, `projects`, `recordings`, `usage`, `organizations`, `org_usage`, `chat_conversations`, `chat_messages`, `chat_daily_usage`

### Storage Buckets

| Bucket | Purpose |
|--------|---------|
| `voice-recordings` | Fallback audio when Whisper fails |
| `chat-images` | User-uploaded images for AI chat |

Both buckets need a policy allowing authenticated reads for the service role.

### Auth Configuration

- Email/password authentication enabled
- Password reset via Supabase Auth `generateLink({ type: 'recovery' })`
- `user_profiles` table populated via database trigger on `auth.users` insert

## CORS Configuration

Whitelist domains in `src/config/index.js`:

- `*.alchemer.com`, `*.alchemer.eu` (surveys)
- `*.lovable.app` (Lovable dashboard)
- `localhost:*` (development)
- The production API URL itself

## Rate Limiting

| Scope | Limit |
|-------|-------|
| Upload/Transcribe | 100 req / 15 min |
| General API | 500 req / 15 min |

Uses `express-rate-limit` v7+ with `trust proxy` configured.

## Security

- **Helmet**: Security headers (cross-origin resource policy set to `cross-origin` for widget)
- **CORS**: Domain whitelist + wildcard patterns
- **RLS**: All tables have Row Level Security
- **Service Role**: Backend uses `service_role` for widget operations (no user JWT)
- **Admin**: `requireAdmin` middleware checks `is_admin` on `user_profiles`
- **Self-protection**: Admin cannot delete themselves or remove their own admin status
