# Voice Capture API - Estado del Proyecto

**Ultima actualizacion:** 2026-02-12
**Branch activo:** `main`
**Repositorio Backend:** genius-voice-capture
**Repositorio Frontend:** genius-voice-dashboard
**Proyecto Supabase:** `hggwsdqjkwydiubhvrvq` (eu-central-1)
**Railway URL:** https://voice-capture-api-production.up.railway.app

---

## Resumen Ejecutivo

Voice Capture es un sistema para capturar respuestas de voz en encuestas de Alchemer y transcribirlas automaticamente usando OpenAI Whisper. Consiste en:

1. **Widget embebible** (`voice.js`) - se inserta en encuestas Alchemer via HTML/JS
2. **Backend API** (Express.js) - recibe audio, transcribe con Whisper, guarda texto
3. **Dashboard** (React + Vite) - panel de administracion para gestionar proyectos y exportar datos

### Arquitectura: Transcripcion Inmediata

```
Widget (voice.js) --POST /api/transcribe--> Backend --Whisper API--> DB (solo texto)
                                                |
                                                v (si Whisper falla 3x)
                                          Supabase Storage (fallback)
```

**Flujo principal:** Widget graba audio -> POST multipart al backend -> Whisper transcribe desde buffer en memoria -> guarda solo transcripcion en DB -> descarta audio.

**Fallback de seguridad:** Si Whisper falla despues de 3 reintentos, el audio se sube a Supabase Storage para procesamiento posterior.

---

## Estado de Implementacion

### Backend (genius-voice-capture)

| Componente | Archivo | Estado | Notas |
|------------|---------|--------|-------|
| Entry Point | `src/index.js` | OK | Express + CORS + rate limiting + helmet + static files |
| Config General | `src/config/index.js` | OK | Variables de entorno |
| Config Supabase | `src/config/supabase.js` | OK | Clientes admin y publico |
| Config OpenAI | `src/config/openai.js` | OK | Cliente OpenAI |
| Auth JWT | `src/middleware/auth.js` | OK | Validacion JWT Supabase (dashboard) |
| Auth ProjectKey | `src/middleware/projectKey.js` | OK | Validacion x-project-key (widget) |
| Error Handler | `src/middleware/errorHandler.js` | OK | Manejo global de errores |
| **Whisper Service** | `src/services/whisper.js` | OK | `transcribeFromBuffer()` + `transcribeAudio()` con retry 3x, timeout 60s |
| Storage Service | `src/services/storage.js` | OK | Operaciones Supabase Storage (fallback) |
| Transcription Queue | `src/services/transcriptionQueue.js` | OK | Cola sync para retranscribe |
| **Transcribe Immediate** | `src/routes/transcribeImmediate.js` | OK | **POST /api/transcribe** - endpoint principal del widget |
| Upload (legacy) | `src/routes/upload.js` | OK | POST /api/upload - flujo anterior |
| Projects | `src/routes/projects.js` | OK | CRUD completo |
| Recordings | `src/routes/recordings.js` | OK | GET + retranscribe (guarded para audio_path null) |
| Transcribe Batch (legacy) | `src/routes/transcribe.js` | OK | Batch transcription - sin uso activo |
| Export | `src/routes/export.js` | OK | Export CSV streaming |
| Validadores | `src/validators/schemas.js` | OK | Esquemas Zod |
| **Widget** | `public/voice.js` | OK | Widget embebible standalone (Shadow DOM, i18n, MediaRecorder) |

### Frontend (genius-voice-dashboard)

| Componente | Archivo | Estado | Notas |
|------------|---------|--------|-------|
| Dashboard | `src/pages/Dashboard.tsx` | OK | Vista general con contadores optimizados |
| New Project | `src/pages/NewProject.tsx` | OK | Crear proyecto (modo fijo: realtime) |
| Project Detail | `src/pages/ProjectDetail.tsx` | OK | 2 tabs: Recordings + Export |
| Recordings | `src/pages/Recordings.tsx` | OK | Lista global con Play condicional |
| Export | `src/pages/Export.tsx` | OK | Export via API backend |
| Settings | `src/pages/Settings.tsx` | OK | Configuracion de cuenta |
| Layout | `src/components/DashboardLayout.tsx` | OK | Responsive con sidebar mobile |
| Sidebar | `src/components/AppSidebar.tsx` | OK | Navegacion con slide-in mobile |
| Audio Player | `src/components/AudioPlayerModal.tsx` | OK | Reproductor de audio (solo fallback recordings) |
| API Client | `src/lib/api.ts` | OK | Cliente HTTP para backend |
| Supabase Client | `src/integrations/supabase/client.ts` | OK | Tipos + cliente (audio_path nullable) |
| i18n | `src/i18n/` | OK | ES/EN/PT con i18next |

### Infraestructura

| Componente | Estado | Detalles |
|------------|--------|----------|
| Supabase | OK | `hggwsdqjkwydiubhvrvq` (eu-central-1) |
| Schema SQL | OK | Tablas: projects, recordings, transcription_batches |
| RLS Policies | OK | Todas las tablas con Row Level Security |
| Storage Bucket | OK | `voice-recordings` (privado, solo para fallback) |
| OpenAI API Key | OK | Key de produccion |
| Railway Deploy | OK | https://voice-capture-api-production.up.railway.app |

---

## Endpoints API

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| GET | `/health` | - | Health check |
| GET | `/voice.js` | - | Widget embebible (static file) |
| **POST** | **`/api/transcribe`** | **x-project-key** | **Transcripcion inmediata (endpoint principal del widget)** |
| POST | `/api/upload` | x-project-key | Upload legacy (almacena audio) |
| GET | `/api/projects` | JWT | Listar proyectos |
| GET | `/api/projects/:id` | JWT | Detalle proyecto |
| POST | `/api/projects` | JWT | Crear proyecto |
| PUT | `/api/projects/:id` | JWT | Actualizar proyecto |
| DELETE | `/api/projects/:id` | JWT | Eliminar proyecto |
| GET | `/api/projects/:id/recordings` | JWT | Listar recordings |
| GET | `/api/projects/:id/recordings/:rid` | JWT | Detalle recording |
| POST | `/api/projects/:id/recordings/:rid/retranscribe` | JWT | Re-transcribir (requiere audio_path) |
| POST | `/api/projects/:id/transcribe-batch` | JWT | Batch transcription (legacy) |
| GET | `/api/projects/:id/export` | JWT | Export CSV streaming |

---

## Widget voice.js

Widget standalone para embeber en encuestas Alchemer:

```html
<div id="genius-voice"
     data-project="proj_xxx"
     data-session="[survey('session id')]"
     data-question="q1"
     data-lang="es"
     data-max-duration="120"
     data-api="https://voice-capture-api-production.up.railway.app">
</div>
<script src="https://voice-capture-api-production.up.railway.app/voice.js"></script>
```

### Atributos

| Atributo | Requerido | Default | Descripcion |
|----------|-----------|---------|-------------|
| `data-project` | Si | - | Public key del proyecto |
| `data-session` | No | URL param o UUID | Session ID (sguid, snc, o fallback) |
| `data-question` | No | null | ID de la pregunta |
| `data-lang` | No | `es` | Idioma (es/en/pt) |
| `data-max-duration` | No | `120` | Duracion maxima en segundos |
| `data-api` | No | Script origin | URL del backend |

### Caracteristicas
- **Shadow DOM** para aislar CSS del host
- **MediaRecorder API** (WebM/Opus preferido, fallback MP4)
- **Estados:** idle -> recording (timer + pulse) -> uploading (spinner) -> success (muestra texto) -> error (retry)
- **i18n interno** (es/en/pt)
- Sin dependencias externas

---

## Estructura de Archivos

```
genius-voice-capture/
├── src/
│   ├── index.js                      # Entry point (Express + routes + static)
│   ├── config/
│   │   ├── index.js                  # Configuracion general
│   │   ├── supabase.js               # Cliente Supabase
│   │   └── openai.js                 # Cliente OpenAI
│   ├── routes/
│   │   ├── transcribeImmediate.js    # POST /api/transcribe (principal)
│   │   ├── upload.js                 # POST /api/upload (legacy)
│   │   ├── projects.js               # CRUD proyectos
│   │   ├── recordings.js             # Grabaciones (guarded audio_path)
│   │   ├── transcribe.js             # Batch transcription (legacy)
│   │   └── export.js                 # Export CSV streaming
│   ├── middleware/
│   │   ├── auth.js                   # JWT validation
│   │   ├── projectKey.js             # Project key validation
│   │   └── errorHandler.js           # Error handling
│   ├── services/
│   │   ├── whisper.js                # transcribeFromBuffer + transcribeAudio
│   │   ├── storage.js                # Supabase Storage (fallback)
│   │   └── transcriptionQueue.js     # Queue para retranscribe
│   ├── utils/
│   │   ├── generateId.js             # ID generation
│   │   └── csvParser.js              # CSV utilities
│   └── validators/
│       └── schemas.js                # Zod schemas
├── public/
│   └── voice.js                      # Widget embebible
├── tests/
├── database/
│   └── schema.sql                    # Supabase schema
├── .env.example
├── package.json
├── railway.json
└── PROJECT_STATUS.md
```

```
genius-voice-dashboard/
├── src/
│   ├── pages/
│   │   ├── Dashboard.tsx             # Vista general
│   │   ├── NewProject.tsx            # Crear proyecto (modo fijo)
│   │   ├── ProjectDetail.tsx         # Detalle: Recordings + Export
│   │   ├── Recordings.tsx            # Lista global recordings
│   │   ├── Export.tsx                # Export via API
│   │   └── Settings.tsx              # Configuracion
│   ├── components/
│   │   ├── DashboardLayout.tsx       # Layout responsive
│   │   ├── AppSidebar.tsx            # Sidebar con mobile support
│   │   ├── AudioPlayerModal.tsx      # Reproductor audio
│   │   └── ui/                       # shadcn/ui components
│   ├── integrations/supabase/
│   │   └── client.ts                 # Tipos + cliente Supabase
│   ├── lib/
│   │   └── api.ts                    # API client (backend)
│   ├── hooks/
│   │   ├── useFormatters.ts          # Formateo fechas/duracion
│   │   └── use-toast.ts              # Toast notifications
│   └── i18n/
│       ├── index.ts                  # i18next config
│       └── locales/{es,en,pt}/       # Traducciones
├── .env                              # VITE_* vars (committed for Lovable)
└── package.json
```

---

## Decisiones Tecnicas

### Arquitectura de Transcripcion
- **Transcripcion inmediata desde buffer:** El audio se procesa en memoria sin almacenamiento intermedio. Esto elimina la complejidad del bucket de Storage, estados intermedios, y polling.
- **Fallback con almacenamiento:** Si Whisper falla 3 veces (retry con backoff exponencial), el audio se sube a Supabase Storage como red de seguridad. Estos recordings quedan con `status: 'failed'` y se pueden retranscribir desde el dashboard.
- **audio_path nullable:** La columna `audio_path` es nullable. Los recordings exitosos tienen `audio_path: null`. Solo los fallback tienen audio almacenado.

### Seguridad
- **RLS habilitado** en todas las tablas
- **Service Role** para operaciones del widget (bypass RLS)
- **Rate Limiting:** 100 req/15min para upload/transcribe, 500 req/15min para API general
- **CORS** configurado con allowlist + wildcard patterns
- **Helmet** para headers de seguridad

### Frontend
- **Lovable deployment:** `.env` con `VITE_*` vars debe estar commiteado (Lovable lo necesita)
- **i18n:** i18next con namespaces (common, projects, dashboard, recordings)
- **Responsive:** Mobile-first con sidebar slide-in

### Backwards Compatibility
- `routes/upload.js` sigue funcionando para flujo legacy
- `routes/transcribe.js` (batch) sigue disponible, sin uso activo
- `services/transcriptionQueue.js` se usa para retranscribe de fallbacks
- Tabla `transcription_batches` conservada (datos historicos)

---

## Migracion Pendiente

### SQL Migration (REQUERIDA antes de deploy)

Ejecutar en Supabase SQL Editor:

```sql
ALTER TABLE recordings ALTER COLUMN audio_path DROP NOT NULL;
```

Esto permite que los recordings de transcripcion inmediata se guarden sin `audio_path`.

---

## Historial de Cambios

| Fecha | Cambio | Commit |
|-------|--------|--------|
| 2026-01-22 | Implementacion inicial completa del API | `00d94d6` |
| 2026-01-22 | Setup infraestructura Supabase + deploy Railway | - |
| 2026-01-22 | Frontend integrado: genius-voice-dashboard | `5805fd5` |
| 2026-02-11 | i18n migration (ES/EN/PT), responsive sidebar, N+1 fixes, batch resilience, export refactor | `f55cf2a` |
| 2026-02-12 | **Arquitectura transcripcion inmediata**: nuevo endpoint POST /api/transcribe, widget voice.js, whisper.js refactored con transcribeFromBuffer | `ab96233` |
| 2026-02-12 | **Frontend simplificado**: eliminar batch workflow, solo Recordings + Export tabs, Play condicional, audio_path nullable | `f9dd361` |

---

*Este archivo debe actualizarse despues de cada sesion de desarrollo significativa.*
