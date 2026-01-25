# Voice Capture API - Contexto para Claude

## Descripción

Backend API para capturar respuestas de audio en encuestas y transcribirlas automáticamente con OpenAI Whisper.

**Parte de:** Genius Labs AI Suite

## URLs Importantes

| Servicio | URL |
|----------|-----|
| **API Producción** | https://voice-capture-api-production.up.railway.app |
| Supabase | https://hggwsdqjkwydiubhvrvq.supabase.co |
| GitHub (Backend) | https://github.com/quack2025/genius-voice-capture |
| GitHub (Frontend) | https://github.com/quack2025/genius-voice-dashboard |

---

## Stack Tecnológico

| Componente | Tecnología |
|------------|------------|
| Runtime | Node.js 20+ |
| Framework | Express.js 4.x |
| Base de datos | Supabase PostgreSQL |
| Autenticación | Supabase Auth (JWT) |
| Storage | Supabase Storage |
| Transcripción | OpenAI Whisper API |
| Validación | Zod |
| Testing | Jest + Supertest |

---

## Estructura del Proyecto

```
src/
├── index.js                 # Entry point Express
├── config/
│   ├── index.js             # Variables de entorno
│   ├── supabase.js          # Clientes Supabase (admin + anon)
│   └── openai.js            # Cliente OpenAI
├── middleware/
│   ├── auth.js              # Validación JWT
│   ├── projectKey.js        # Validación x-project-key
│   └── errorHandler.js      # Manejo global de errores
├── routes/
│   ├── upload.js            # POST /api/upload (widget)
│   ├── projects.js          # CRUD proyectos
│   ├── recordings.js        # Lista grabaciones
│   ├── transcribe.js        # Batch transcription
│   └── export.js            # Export CSV
├── services/
│   ├── whisper.js           # Integración OpenAI Whisper
│   ├── storage.js           # Supabase Storage
│   └── transcriptionQueue.js # Procesamiento de cola
├── validators/
│   └── schemas.js           # Esquemas Zod
└── utils/
    ├── generateId.js        # Generación de IDs
    └── csvParser.js         # Conversión a CSV
```

---

## API Endpoints

### Públicos (Widget)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/health` | - | Health check |
| POST | `/api/upload` | x-project-key | Widget sube audio |

### Protegidos (Dashboard - JWT)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/projects` | Listar proyectos del usuario |
| POST | `/api/projects` | Crear proyecto |
| GET | `/api/projects/:id` | Detalle de proyecto |
| PUT | `/api/projects/:id` | Actualizar proyecto |
| DELETE | `/api/projects/:id` | Eliminar proyecto + audios |
| GET | `/api/projects/:id/recordings` | Listar grabaciones (paginado) |
| POST | `/api/projects/:id/recordings/:rid/retranscribe` | Re-transcribir |
| POST | `/api/projects/:id/transcribe-batch` | Preparar batch (preview) |
| GET | `/api/projects/:id/transcribe-batch/:bid` | Estado del batch |
| POST | `/api/projects/:id/transcribe-batch/:bid/confirm` | Ejecutar batch |
| POST | `/api/projects/:id/transcribe-batch/:bid/cancel` | Cancelar batch |
| GET | `/api/projects/:id/export` | Exportar CSV |

---

## Modelo de Datos

### projects
```sql
id (UUID, PK)
user_id (UUID) → auth.users
name (VARCHAR 255)
public_key (VARCHAR 50) -- proj_xxx para widget
language (VARCHAR 5) -- 'es', 'en', 'pt'
transcription_mode (VARCHAR 20) -- 'realtime' | 'batch'
settings (JSONB)
created_at, updated_at (TIMESTAMPTZ)
```

### recordings
```sql
id (UUID, PK)
project_id (UUID) → projects
session_id (VARCHAR 100) -- ID de Alchemer
question_id (VARCHAR 50)
audio_path (TEXT) -- path en Storage
audio_size_bytes (INTEGER)
duration_seconds (INTEGER)
transcription (TEXT)
previous_transcription (TEXT)
language_detected (VARCHAR 5)
status (VARCHAR 20) -- pending|processing|completed|failed
error_message (TEXT)
metadata (JSONB)
batch_id (UUID) → transcription_batches
created_at, transcribed_at (TIMESTAMPTZ)
```

### transcription_batches
```sql
id (UUID, PK)
project_id (UUID) → projects
user_id (UUID) → auth.users
status (VARCHAR 30) -- pending_confirmation|processing|completed|partial|failed|cancelled
total_recordings, completed_count, failed_count (INTEGER)
estimated_cost_usd, actual_cost_usd (DECIMAL)
session_ids_requested (TEXT[])
session_ids_not_found (TEXT[])
created_at, confirmed_at, completed_at (TIMESTAMPTZ)
```

---

## Flujos Principales

### Upload de Audio (Widget)
```
Widget → POST /api/upload (x-project-key: proj_xxx)
    → Validar project key
    → Guardar audio en Supabase Storage
    → Crear registro en recordings (status: pending)
    → Si mode=realtime: encolar transcripción
    → Response: { success, recording_id, session_id }
```

### Transcripción Batch
```
1. Frontend → POST /transcribe-batch (session_ids[])
   → Backend analiza: encontrados, no encontrados, ya transcritos
   → Response: { batch_id, summary, estimated_cost }

2. Frontend → POST /transcribe-batch/:bid/confirm
   → Backend inicia transcripción asíncrona
   → Status: processing

3. Frontend → GET /transcribe-batch/:bid (polling)
   → Backend retorna progreso
   → Cuando completa: status = completed|partial

4. Para cada recording:
   → Descargar audio de Storage
   → Enviar a OpenAI Whisper
   → Guardar transcripción en DB
   → Actualizar status
```

### Whisper Integration
```javascript
// services/whisper.js
const transcription = await openai.audio.transcriptions.create({
  file: audioFile,
  model: 'whisper-1',
  language: project.language, // es, en, pt
  response_format: 'verbose_json'
});
// Costo: $0.006 USD por minuto
```

---

## Variables de Entorno

```env
# Supabase
SUPABASE_URL=https://hggwsdqjkwydiubhvrvq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Admin (bypass RLS)
SUPABASE_ANON_KEY=eyJ...          # Solo para validar JWT

# OpenAI
OPENAI_API_KEY=sk-...

# Server
PORT=3000
NODE_ENV=development

# Límites
MAX_AUDIO_SIZE_MB=10
MAX_AUDIO_DURATION_SECONDS=180
```

---

## Modos de Transcripción

| Modo | Comportamiento |
|------|----------------|
| **realtime** | Audio sube → Transcribe inmediatamente |
| **batch** | Audio sube → Guarda como pending → Usuario decide cuándo transcribir |

Configurado por proyecto en `projects.transcription_mode`.

---

## Comandos

```bash
npm install          # Instalar dependencias
npm run dev          # Desarrollo (nodemon, puerto 3000)
npm test             # Correr tests
npm start            # Producción
```

---

## Relación con Frontend

| Frontend | Backend |
|----------|---------|
| Dashboard React | Este repo (Express API) |
| Supabase directo para lectura | Supabase para escritura + Storage |
| batchApi.prepare() | POST /transcribe-batch |
| batchApi.confirm() | POST /transcribe-batch/:bid/confirm |
| batchApi.getStatus() | GET /transcribe-batch/:bid |
| exportApi.exportCsv() | GET /export |

El frontend usa JWT de Supabase Auth, que este backend valida.

---

## Seguridad

- **CORS**: Whitelist de dominios (Alchemer, Lovable, localhost)
- **Rate Limiting**: 100 req/15min upload, 500 req/15min API
- **Helmet**: Headers de seguridad
- **Auth**: JWT validado por Supabase
- **Project Key**: Previene spoofing del widget

---

## Documentación Adicional

| Archivo | Contenido |
|---------|-----------|
| `docs/PRODUCT_SPEC.md` | Visión de producto, flujos UX |
| `docs/TECHNICAL_SPEC.md` | Detalles de endpoints, SQL |
| `PROJECT_STATUS.md` | Estado del desarrollo |
| `database/schema.sql` | Schema completo de BD |

---

## Deploy

**Plataforma:** Railway

```bash
# Deploy automático por push a main
git push origin main

# Variables configuradas en Railway Dashboard
```

**URL Producción:** https://voice-capture-api-production.up.railway.app

---

## Pendientes

- [ ] XLSX export (actualmente retorna 501)
- [ ] Migrar a cola asíncrona real (BullMQ)
- [ ] Tests de integración completos
- [ ] Widget voice.js para el snippet del frontend
