# Code Conventions — Voice Capture API (Backend)

## General

- **Language**: JavaScript (CommonJS, no TypeScript)
- **Module system**: `require()` / `module.exports`
- **Framework**: Express.js 4.x
- **Validation**: Zod schemas in `src/validators/schemas.js`
- **No ORM**: Direct Supabase client queries

## File Organization

- Routes in `src/routes/` — one file per domain (projects, recordings, admin, chat, org)
- Middleware in `src/middleware/` — auth, adminAuth, projectKey, errorHandler
- Config in `src/config/` — environment vars, SDK clients, plan definitions
- Services in `src/services/` — Whisper, Storage, transcription queue
- Validators in `src/validators/` — Zod schemas

## Route Pattern

```javascript
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// All routes use requireAuth or requireAdmin
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { data, error } = await supabaseAdmin.from('table').select('*').eq('user_id', userId);
    if (error) throw error;
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Route description:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
```

## Error Handling

- Try/catch in every route handler
- `console.error` with descriptive prefix
- Return `{ success: false, error: message }` on failure
- Global error handler as last middleware (`errorHandler.js`)
- HTTP status codes: 400 (validation), 401 (unauth), 403 (forbidden), 404 (not found), 500 (server)

## Auth Patterns

- `requireAuth` sets `req.user = { id, email }` from JWT
- `requireAdmin` composes `requireAuth` + checks `is_admin` on `user_profiles`
- Widget routes use `projectKey` middleware instead of JWT
- Self-protection: admin routes prevent operating on yourself (delete, remove admin)

## Database Access

- Always use `supabaseAdmin` (service role) for write operations
- Direct Supabase client queries (no ORM)
- Use `.select('*')`, `.eq()`, `.insert()`, `.update()`, `.delete()`
- For counts: `.select('id', { count: 'exact', head: true })`
- Cascade deletes: manual ordered deletion respecting FK constraints

## Plan Enforcement

- Plans defined in `src/config/plans.js` (single source of truth, no DB table)
- Plan key in DB: `free`, `freelancer`, `pro`, `enterprise`
- Display name for `freelancer` is `Starter`
- Usage tracked in `usage` table (user_id + month composite key)
- Org usage tracked in `org_usage` table
- Chat daily limit tracked in `chat_daily_usage` table (user_id + date)
- Check limits before operations (project creation, transcription, chat message)

## Cascade Delete Patterns

### Delete User (admin)
Order: `chat_messages` (via FK) → `chat_conversations` → `chat_daily_usage` → `recordings` (for user's projects) → `projects` → `usage` → clear `org_id/org_role` → `user_profiles` → `auth.admin.deleteUser()`

### Delete Organization (admin)
Order: clear `org_id = null, org_role = null` on all members → `org_usage` → `organizations`

### Delete Project (user)
Order: `recordings` for project → `projects`

## Response Format

All API responses follow:
```json
{ "success": true, "data": {...} }
{ "success": false, "error": "message" }
```

Admin endpoints may include additional top-level fields (e.g., `users`, `pagination`, `org`, `members`).

## Known Issues & Lessons

1. **Middleware order in Express is critical** — static files before CORS, health before everything
2. **Whisper returns full language names** (e.g., "spanish") — must map to ISO codes before DB insert
3. **`audio_path` column** — nullable in schema, but code uses placeholder strings (`transcribed-immediate`, `failed-no-audio`) as extra safety
4. **Alchemer strips `data-*` attributes** — widget container must be created via JavaScript, not HTML
5. **Railway healthcheck** — `/health` must be first registered route, before Helmet/CORS
6. **`express-rate-limit` v7+** — requires `trust proxy` when behind reverse proxy
