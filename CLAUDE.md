# Voice Capture API — Backend

Express.js API for the Genius Voice Capture platform. Handles audio transcription (Whisper), project/recording CRUD, user/org management, admin backoffice, and AI help chat (Claude).

**Part of:** Genius Labs AI Suite
**Repos:** Backend (this) + [Frontend Dashboard](https://github.com/quack2025/genius-voice-dashboard)

## Quick Reference

| Item | Value |
|------|-------|
| Runtime | Node.js 20+, Express 4.x |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth JWT (dashboard) / x-project-key (widget) |
| Transcription | OpenAI Whisper API (whisper-1) |
| AI Chat | Anthropic Claude Haiku 4.5 |
| Deploy | Railway (auto-deploy on push to main) |
| API URL | https://voice-capture-api-production.up.railway.app |
| Supabase | https://hggwsdqjkwydiubhvrvq.supabase.co |

## Project Structure

```
src/
├── index.js                     # Express entry point, middleware chain
├── config/
│   ├── index.js                 # Environment variables
│   ├── supabase.js              # Clients (admin + anon)
│   ├── openai.js                # OpenAI client
│   ├── anthropic.js             # Anthropic SDK client
│   └── plans.js                 # Plan definitions (single source of truth)
├── middleware/
│   ├── auth.js                  # JWT validation (requireAuth)
│   ├── adminAuth.js             # Admin guard (requireAdmin = requireAuth + is_admin)
│   ├── projectKey.js            # Widget x-project-key validation
│   └── errorHandler.js          # Global error handler
├── routes/
│   ├── transcribeImmediate.js   # POST /api/transcribe (main widget endpoint)
│   ├── projects.js              # CRUD projects
│   ├── recordings.js            # List/retranscribe recordings
│   ├── export.js                # CSV streaming export
│   ├── account.js               # User profile + usage
│   ├── admin.js                 # Super admin endpoints (users, orgs, stats)
│   ├── org.js                   # Organization management
│   ├── chat.js                  # AI help chat (conversations + messages)
│   ├── textResponse.js          # Text-only responses
│   ├── widgetConfig.js          # Widget dynamic config
│   ├── upload.js                # Legacy audio upload
│   └── transcribe.js            # Legacy batch transcription
├── prompts/
│   └── helpChatSystem.js        # System prompt for AI chat
├── services/
│   ├── whisper.js               # Whisper transcription + retry
│   ├── storage.js               # Supabase Storage (fallback)
│   └── transcriptionQueue.js    # Sync queue for retranscribe
└── validators/
    └── schemas.js               # Zod schemas
```

## Plans (4 tiers)

| Key | Name | Price | Responses/mo | Chat/day |
|-----|------|-------|-------------|----------|
| free | Free | $0 | 100 | 5 |
| freelancer | Starter | $39 | 1,500 | 20 |
| pro | Pro | $199 | 10,000 | 50 |
| enterprise | Enterprise | $499 | 50,000 | 100 |

Plan key in DB is `freelancer`, display name is `Starter`.

## Middleware Order (critical)

1. `trust proxy` → 2. `/health` → 3. Helmet → 4. voice.js static → 5. CORS → 6. body parsers → 7. rate limiting → 8. API routes

## Commands

```bash
npm install    # Install deps
npm run dev    # Dev (nodemon, port 3000)
npm start      # Production
npm test       # Jest tests
npm run build  # Build minified voice.js widget
```

## Detailed Docs

- [agent_docs/architecture.md](agent_docs/architecture.md) — API endpoints, data model, auth flows, widget details
- [agent_docs/building_and_deploying.md](agent_docs/building_and_deploying.md) — Environment vars, Railway deploy, Supabase setup
- [agent_docs/code_conventions.md](agent_docs/code_conventions.md) — Patterns, error handling, known issues
