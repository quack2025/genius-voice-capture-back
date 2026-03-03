# Voice Capture - Especificación de Producto

**Producto:** Voice Capture (Genius Labs AI Suite)
**Versión:** 1.9
**Última actualización:** 2026-02-17

---

## Resumen Ejecutivo

### Propósito
Permitir a los encuestados responder preguntas abiertas usando audio o texto, con transcripción automática mediante IA para respuestas de voz.

### Problema que Resuelve
- Los respondentes abandonan encuestas con muchas preguntas abiertas (fatiga de escritura)
- Respuestas de texto son más cortas y menos ricas que respuestas habladas
- El 93% de la comunicación es no-verbal; el texto pierde matices

### Propuesta de Valor
> "Respuestas más ricas, menos fricción, misma integración."

- **Para el respondente:** Hablar es 3-4x más rápido que escribir
- **Para el investigador:** Respuestas más largas y detalladas
- **Para el analista:** Transcripciones listas para codificar con Survey Coder PRO

### Principio de Diseño
> Setup en 1 minuto. Cero conocimiento técnico requerido.

---

## Posicionamiento en el Suite

```
┌─────────────────────────────────────────────────────────────┐
│                  GENIUS LABS AI SUITE                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐                                        │
│  │  VOICE CAPTURE  │ ←── Captura + Transcripción            │
│  │      (MVP)      │                                        │
│  └────────┬────────┘                                        │
│           │                                                 │
│           │ Transcripciones (export CSV)                    │
│           ▼                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                 │
│  │  Survey Coder   │    │   Talk2data     │                 │
│  │      PRO        │    │                 │                 │
│  │  (codificación) │    │ (análisis SPSS) │                 │
│  └─────────────────┘    └─────────────────┘                 │
│                                                             │
│  ┌─────────────────┐                                        │
│  │    Sistema      │ ←── Integración futura (Fase 2+)       │
│  │   Repreguntas   │                                        │
│  └─────────────────┘                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Arquitectura Técnica

### Flujo de Datos

```
┌─────────────────────────────────────────────────────────────────┐
│                         ALCHEMER                                │
│                                                                 │
│  1. Encuesta con widget Voice Capture                           │
│     • Merge code inyecta session_id automáticamente             │
│     • Widget muestra botón de grabación                         │
│                                                                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ POST /api/upload
                            │ • audio_blob (webm/mp3)
                            │ • session_id (de Alchemer)
                            │ • project_id (del snippet)
                            │ • question_id (opcional)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VOICE CAPTURE API                            │
│                                                                 │
│  2. Recepción del audio                                         │
│     ├─ Validar project_id                                       │
│     ├─ Validar tamaño (<25MB) y formato                         │
│     ├─ Guardar audio en S3                                      │
│     └─ Responder HTTP 200 inmediatamente                        │
│                                                                 │
│  3. Procesamiento asíncrono (cola)                              │
│     ├─ Descargar audio de S3                                    │
│     ├─ Enviar a Whisper API                                     │
│     ├─ Guardar transcripción en DB                              │
│     └─ Actualizar estado: "completed"                           │
│                                                                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BASE DE DATOS                                │
│                                                                 │
│  recordings                                                     │
│  ├─ id (uuid)                                                   │
│  ├─ project_id (FK)                                             │
│  ├─ session_id (string) ←── Clave para JOIN con Alchemer        │
│  ├─ question_id (string, opcional)                              │
│  ├─ audio_url (S3)                                              │
│  ├─ transcription (text)                                        │
│  ├─ duration_seconds (int)                                      │
│  ├─ input_method (voice|text, default voice)                    │
│  ├─ language (string)                                           │
│  ├─ status (pending|processing|completed|failed)                │
│  ├─ created_at (timestamp)                                      │
│  └─ transcribed_at (timestamp)                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ Export CSV
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              DASHBOARD VOICE CAPTURE                            │
│                                                                 │
│  4. Usuario descarga CSV con:                                   │
│     • session_id                                                │
│     • transcription                                             │
│     • duration_seconds                                          │
│     • created_at                                                │
│                                                                 │
│  5. Usuario hace JOIN con export de Alchemer por session_id     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Stack Tecnológico

| Componente | Tecnología | Razón |
|------------|------------|-------|
| Widget (voice.js v1.9) | Vanilla JS + MediaRecorder API | Sin dependencias, funciona en cualquier sitio |
| Dashboard | React + shadcn/ui + Tailwind (Lovable) | Desarrollo rápido, consistente con Survey Coder PRO |
| Backend API | Node.js + Express (Claude Code) | Control total, desarrollo con AI |
| Auth | Supabase Auth | Consistente con otros productos |
| Base de datos | Supabase PostgreSQL | Integrado con auth, RLS |
| Storage (audio) | Supabase Storage | Integrado, signed URLs |
| Transcripción | OpenAI Whisper API | $0.006/min, 57 idiomas, rápido |
| Deploy | Railway (API) + Lovable (Dashboard) | Económico, escalable |
| Dominio API | `api.voicecapture.ai` | Dominio profesional (Railway) |
| Dominio Dashboard | `voicecapture.ai` | Lovable custom domain |

### Repositorios

| Repo | Contenido |
|------|-----------|
| `genius-voice-capture` | Backend API (Claude Code) |
| `genius-voice-dashboard` | Frontend Lovable |
| CDN (Supabase Storage) | `voice.js` widget |

---

## Modos de Transcripción

Voice Capture ofrece dos modos para optimizar costos según las necesidades del proyecto:

### Modo Real-Time (default)

```
┌─────────────────────────────────────────────────────────────────┐
│  REAL-TIME: Transcripción Inmediata                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Respondente graba → Audio sube → Whisper transcribe → Listo    │
│                                                                 │
│  ✅ Ventajas:                                                   │
│  • Resultados visibles durante fieldwork                        │
│  • Monitoreo en tiempo real                                     │
│  • Detectar problemas temprano                                  │
│                                                                 │
│  ⚠️ Consideración:                                              │
│  • Paga por TODOS los audios (incluye abandonos ~30%)           │
│                                                                 │
│  💡 Ideal para:                                                 │
│  • Proyectos pequeños/medianos                                  │
│  • Necesidad de monitoreo en vivo                               │
│  • Fieldwork corto                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Modo Batch (ahorro de costos)

```
┌─────────────────────────────────────────────────────────────────┐
│  BATCH: Transcripción Selectiva Post-Fieldwork                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Durante fieldwork:                                             │
│  Respondente graba → Audio sube → Se GUARDA (no transcribe)     │
│                                                                 │
│  Post-fieldwork:                                                │
│  Usuario sube CSV de Alchemer (solo completas) →                │
│  Sistema encuentra audios que coinciden →                       │
│  Usuario confirma → Transcribe solo esos                        │
│                                                                 │
│  ✅ Ventajas:                                                   │
│  • Ahorro ~30% (no paga abandonos)                              │
│  • Control total sobre qué transcribir                          │
│  • Costo predecible antes de confirmar                          │
│                                                                 │
│  ⚠️ Consideración:                                              │
│  • Sin resultados durante fieldwork                             │
│  • Paso extra post-fieldwork                                    │
│                                                                 │
│  💡 Ideal para:                                                 │
│  • Proyectos grandes (+1,000 respuestas)                        │
│  • Presupuesto ajustado                                         │
│  • No requiere monitoreo en vivo                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Flujo Detallado: Modo Batch

```
┌─────────────────────────────────────────────────────────────────┐
│  PASO 1: Termina fieldwork en Alchemer                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PASO 2: Exportar de Alchemer                                   │
│                                                                 │
│  • Filtrar por Status = "Complete"                              │
│  • Incluir columna Session ID                                   │
│  • Descargar CSV                                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PASO 3: Subir a Voice Capture                                  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Transcribir Encuestas Completadas                        │  │
│  │                                                           │  │
│  │  Opción A: Subir CSV de Alchemer                          │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │     📄 Arrastra tu export aquí                      │  │  │
│  │  │        o [Seleccionar archivo]                      │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │  Opción B: Pegar lista de Session IDs                     │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ 1767819533_695ec90d302493.52725793                  │  │  │
│  │  │ 1767819534_695ec90d302494.12345678                  │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PASO 4: Confirmar transcripción                                │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Resumen                                                  │  │
│  │                                                           │  │
│  │  Session IDs en tu archivo:     892                       │  │
│  │  Audios encontrados:            847                       │  │
│  │  Audios sin grabar:              45  [Ver cuáles]         │  │
│  │                                                           │  │
│  │  Duración total:               14.2 horas                 │  │
│  │  Costo estimado:               $85.20                     │  │
│  │                                                           │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ ⚠️ 45 session_ids no tienen audio.                 │  │  │
│  │  │    El respondente no grabó o hubo error.           │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │            [Cancelar]    [Transcribir 847 audios]         │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PASO 5: Descargar resultados                                   │
│                                                                 │
│  • CSV con session_id + transcripción                           │
│  • Listo para JOIN con export de Alchemer                       │
└─────────────────────────────────────────────────────────────────┘
```

### Comparativa de Costos

| Escenario | Audios | Abandonos (30%) | Completadas | Costo Real-Time | Costo Batch | Ahorro |
|-----------|--------|-----------------|-------------|-----------------|-------------|--------|
| Pequeño | 200 | 60 | 140 | $1.20 | $0.84 | $0.36 |
| Mediano | 1,000 | 300 | 700 | $6.00 | $4.20 | $1.80 |
| Grande | 5,000 | 1,500 | 3,500 | $30.00 | $21.00 | $9.00 |

*Asumiendo 1 minuto promedio por audio a $0.006/min*

---

## Flujo de Usuario

### A. Setup del Proyecto (Investigador)

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Usuario entra a voicecapture.ai                         │
│     └─> Login con cuenta Genius Labs                            │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Crear nuevo proyecto                                        │
│     ├─ Nombre: "Estudio NPS Q1 2026"                            │
│     ├─ Idioma principal: Español                                │
│     └─> Sistema genera project_id único                         │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Copiar snippets (2 partes para Alchemer)                     │
│                                                                 │
│  Paso 1: Custom HEAD (una sola vez por encuesta)                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ <script src="https://api.voicecapture.ai/voice.js"> │  │
│  │ </script>                                                 │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Paso 2: JavaScript Action (por pregunta)                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ var QUESTION_ID = 'q1';                                   │  │
│  │ var c = document.getElementById('genius-voice-' +          │  │
│  │         QUESTION_ID);                                     │  │
│  │ if (c) {                                                  │  │
│  │   c.dataset.project = 'proj_xxx';                         │  │
│  │   c.dataset.session = '[survey("session id")]';           │  │
│  │   c.dataset.question = QUESTION_ID;                       │  │
│  │   c.dataset.lang = 'es';                                  │  │
│  │   if (window.GeniusVoice) { GeniusVoice.init(c); }       │  │
│  │ }                                                         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  [Copiar al portapapeles]                                       │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Configurar en Alchemer (3 pasos)                            │
│     ├─ Style > HTML/CSS Editor > Custom HEAD → pegar Step 1     │
│     ├─ En texto de pregunta (Source HTML) agregar:               │
│     │   <div id="genius-voice-q1"></div>                        │
│     ├─ En pregunta: "+" > Action > JavaScript → pegar Step 2    │
│     └─> ¡Listo! (repetir Steps 2-3 por cada pregunta)           │
└─────────────────────────────────────────────────────────────────┘
```

### B. Responder Encuesta (Respondente)

```
┌─────────────────────────────────────────────────────────────────┐
│  Encuesta en Alchemer                                           │
│                                                                 │
│  P5. ¿Por qué nos diste esa calificación?                       │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │              🎤 Grabar respuesta                          │  │
│  │                                                           │  │
│  │         (o escribe tu respuesta abajo)                    │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  [Textbox opcional para respuesta escrita]                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ Click en 🎤
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Widget de grabación                                            │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │                    ● 00:15                                │  │
│  │                  Grabando...                              │  │
│  │                                                           │  │
│  │              [■ Detener]  [✕ Cancelar]                    │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ Click en ■ Detener
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Confirmación                                                   │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │           ✓ Audio guardado (15 segundos)                  │  │
│  │                                                           │  │
│  │              [▶ Escuchar]  [🔄 Grabar de nuevo]           │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│                      [Siguiente →]                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### C. Exportar Datos (Investigador)

```
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard Voice Capture                                        │
│                                                                 │
│  Proyecto: Estudio NPS Q1 2026                                  │
│  Respuestas: 247 audios | 3.2 horas totales                     │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ session_id          │ duración │ estado    │ acciones     │  │
│  ├─────────────────────┼──────────┼───────────┼──────────────┤  │
│  │ 1767819533_695ec... │ 0:45     │ ✓ Listo   │ ▶ 📝 🗑      │  │
│  │ 1767819534_695ec... │ 1:23     │ ✓ Listo   │ ▶ 📝 🗑      │  │
│  │ 1767819535_695ec... │ 0:18     │ ⏳ Proceso │ ▶ 📝 🗑      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  [Descargar CSV]  [Descargar con audios (ZIP)]                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Widget: voice.js (v1.9)

### Funcionalidad del Script

```javascript
// El script automáticamente:
// 1. Detecta el session_id de Alchemer via merge code
// 2. Fetch config desde /api/widget-config/:projectKey (max_duration, branding, theme)
// 3. Renderiza textarea + botón dictar (sin botón enviar — auto-save on blur)
// 4. Maneja permisos de micrófono (solo si el usuario usa dictado)
// 5. Dictado AGREGA texto al textarea (no reemplaza), editable
// 6. Auto-save de texto: POST /api/text-response on blur + 2s debounce (UPSERT, sin duplicados)
// 7. Envío de voz: POST /api/transcribe → Whisper → texto se agrega al textarea
// 8. Muestra badge "Powered by Survey Genius" (si Free tier)
// 9. Emite eventos: geniusvoice:ready, recording-start, recording-stop, transcribed, text-saved, error
```

### Features v1.8
- **Dual-mode**: Textarea siempre visible + botón "Dictar" (sin botón enviar)
- **Auto-save on blur**: Texto se guarda automáticamente al perder foco (+ 2s debounce backup)
- **UPSERT backend**: Solo 1 recording por (session, question, input_method) — sin duplicados
- **Dictado agrega texto**: La transcripción de voz se AGREGA al texto existente (no reemplaza)
- **Borrar texto sincroniza**: Si el usuario borra todo, el backend también borra la respuesta
- **input_method tracking**: Cada respuesta registra si fue `'voice'` o `'text'`
- **Lifecycle events**: 6 custom events para integración de desarrolladores
- **Accesibilidad**: aria-label, aria-live, aria-hidden, focus-visible, min-height 44px en botones
- **Config fetch**: Al iniciar, consulta `/api/widget-config/:projectKey` para obtener max_duration, branding y tema
- **Branding badge**: Plan Free muestra "Powered by Survey Genius" al pie del widget
- **Temas custom**: Plan Pro permite colores personalizados (`primary_color`, `background`, `border_radius`)
- **API URL**: Apunta a `https://api.voicecapture.ai` por defecto

### UX Flow v1.8

```
┌──────────────────────────────────────┐
│  ┌──────────────────────────────┐    │
│  │ Escribe tu respuesta aquí...│    │
│  │                              │    │
│  └──────────────────────────────┘    │
│                                      │
│          [ 🎤 Dictar ]               │
│                                      │
│  Powered by Survey Genius  (free)    │
└──────────────────────────────────────┘
```

**Flujo texto:** Escribir → blur/Next → auto-save via POST /api/text-response (UPSERT) → guardado
**Flujo voz:** Click Dictar → grabar → detener → Whisper transcribe → texto se AGREGA al textarea (editable) → voz ya guardada server-side → si usuario edita y blur → auto-save actualiza (no duplica)

### Integración con Alchemer Session ID

El truco clave es que Alchemer permite usar merge codes en JavaScript:

```javascript
// Alchemer reemplaza esto server-side antes de enviar al browser
var sessionId = '[survey("session id")]';
// Resultado: sessionId = "1767819533_695ec90d302493.52725793"
```

Para que esto funcione, el snippet debe estar en un **JavaScript Action** de Alchemer, no en un Text/Media element simple.

### Alternativa: Capturar de la URL

Si el merge code no está disponible, el script puede extraer el session_id de la URL de Alchemer (que lo incluye como parámetro).

---

## API Endpoints

**Base URL:** `https://api.voicecapture.ai`

### Autenticación
- Endpoints del dashboard requieren JWT de Supabase Auth
- Endpoint de upload usa `x-project-key` (público, en el snippet)
- Endpoints de widget-config son públicos (sin auth)

---

### POST /api/upload
Recibe el audio grabado desde el widget.

**Headers:**
```
x-project-key: [project_public_key]
```

**Request:**
```
POST /api/upload
Content-Type: multipart/form-data

audio: [blob]
project_id: "proj_ABC123XYZ"
session_id: "1767819533_695ec90d302493.52725793"
question_id: "q5" (opcional)
duration_seconds: 45
```

**Response:**
```json
{
  "success": true,
  "recording_id": "rec_xyz789",
  "status": "pending" | "processing"
}
```

*Status depende del modo del proyecto: `pending` si es batch, `processing` si es real-time*

---

### GET /api/projects/:project_id/recordings
Lista las grabaciones de un proyecto.

**Query params:**
- `status`: pending | processing | completed | failed (opcional)
- `page`: número de página (default 1)
- `limit`: resultados por página (default 50, max 100)

**Response:**
```json
{
  "recordings": [
    {
      "id": "rec_xyz789",
      "session_id": "1767819533_695ec90d302493.52725793",
      "transcription": "El producto me pareció muy bueno...",
      "duration_seconds": 45,
      "status": "completed",
      "audio_url": "https://...",
      "created_at": "2026-01-21T10:30:00Z",
      "transcribed_at": "2026-01-21T10:30:45Z"
    }
  ],
  "total": 847,
  "page": 1,
  "pages": 17
}
```

---

### POST /api/projects/:project_id/transcribe-batch
Prepara transcripción selectiva por lista de session_ids. NO ejecuta aún.

**Request:**
```json
{
  "session_ids": [
    "1767819533_695ec90d302493.52725793",
    "1767819534_695ec90d302494.12345678"
  ]
}
```

**Response:**
```json
{
  "success": true,
  "batch_id": "batch_abc123",
  "summary": {
    "requested": 892,
    "found": 847,
    "not_found": 45,
    "already_transcribed": 12,
    "to_transcribe": 835
  },
  "not_found_session_ids": ["176781999_notfound..."],
  "estimated_duration_minutes": 835,
  "estimated_cost_usd": 5.01,
  "status": "pending_confirmation"
}
```

---

### POST /api/projects/:project_id/transcribe-batch/:batch_id/confirm
Confirma y ejecuta el batch de transcripción.

**Response:**
```json
{
  "success": true,
  "batch_id": "batch_abc123",
  "status": "processing",
  "recordings_queued": 835,
  "estimated_completion": "2026-01-21T12:30:00Z"
}
```

---

### GET /api/projects/:project_id/transcribe-batch/:batch_id
Estado del batch de transcripción.

**Response:**
```json
{
  "batch_id": "batch_abc123",
  "status": "processing" | "completed" | "partial" | "failed",
  "progress": {
    "total": 835,
    "completed": 423,
    "failed": 2,
    "pending": 410
  },
  "failed_recordings": [
    {"id": "rec_xyz", "session_id": "...", "error": "Audio corrupted"}
  ],
  "started_at": "2026-01-21T10:30:00Z",
  "completed_at": null,
  "estimated_completion": "2026-01-21T12:30:00Z"
}
```

---

### GET /api/projects/:project_id/export
Descarga CSV/Excel con transcripciones completadas.

**Query params:**
- `format`: csv | xlsx (default csv)
- `include_pending`: true | false (default false)
- `include_audio_url`: true | false (default true)

**Response (CSV):**
```csv
session_id,transcription,duration_seconds,status,audio_url,created_at,transcribed_at
1767819533_695ec90d302493.52725793,"El producto me pareció muy bueno...",45,completed,https://...,2026-01-21T10:30:00Z,2026-01-21T10:30:45Z
```

---

### POST /api/projects/:project_id/recordings/:recording_id/retranscribe
Re-procesa la transcripción de un audio específico.

**Response:**
```json
{
  "success": true,
  "recording_id": "rec_xyz789",
  "status": "processing",
  "previous_transcription": "Texto anterior..."
}
```

---

### DELETE /api/projects/:project_id/recordings/:recording_id
Elimina una grabación y su audio.

**Response:**
```json
{
  "success": true,
  "deleted": true
}
```

---

### GET /api/account/usage
Retorna el uso actual del usuario y su plan. Requiere JWT.

**Response:**
```json
{
  "success": true,
  "data": {
    "plan": "freelancer",
    "plan_name": "Freelancer",
    "limits": {
      "max_responses": 500,
      "max_projects": 5,
      "max_duration": 120
    },
    "usage": {
      "responses_this_month": 127,
      "projects_count": 3
    },
    "month": "2026-02"
  }
}
```

---

### GET /api/account/plans
Retorna definiciones de todos los planes (público, no requiere auth).

**Response:**
```json
{
  "success": true,
  "plans": {
    "free": { "name": "Free", "price": 0, "max_responses": 50, ... },
    "freelancer": { "name": "Freelancer", "price": 29, ... },
    "pro": { "name": "Pro", "price": 149, ... }
  }
}
```

---

### GET /api/widget-config/:projectKey
Retorna configuración del widget para un proyecto (público, usado por voice.js).

**Response:**
```json
{
  "max_duration": 120,
  "language": "es",
  "show_branding": false,
  "theme": {
    "preset": "default",
    "primary_color": "#6366f1",
    "background": "#ffffff",
    "border_radius": 12
  }
}
```

*Cached 5 minutos en el backend.*

---

### GET /api/projects/:projectId/allowed-domains
Retorna la lista de dominios permitidos de un proyecto (domain locking).

**Headers:** JWT Supabase

**Response:**
```json
{
  "success": true,
  "allowed_domains": ["*.alchemer.com", "*.alchemer.eu", "mycompany.com"]
}
```

*Array vacío = sin restricción de dominio.*

---

### PUT /api/projects/:projectId/allowed-domains
Configura la lista de dominios permitidos para un proyecto.

**Headers:** JWT Supabase

**Request:**
```json
{
  "domains": ["*.alchemer.com", "*.alchemer.eu", "mycompany.com"]
}
```

**Response:**
```json
{
  "success": true,
  "allowed_domains": ["*.alchemer.com", "*.alchemer.eu", "mycompany.com"]
}
```

*Array vacío desactiva domain locking. Soporta wildcards (`*.example.com`).*

---

## Modelo de Datos (Supabase)

### Tabla: user_profiles

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK, FK a auth.users |
| plan | varchar(20) | 'free' \| 'freelancer' \| 'pro' (default 'free') |
| plan_started_at | timestamp | Fecha inicio del plan actual |
| created_at | timestamp | |
| updated_at | timestamp | |

*Se crea automáticamente via trigger on_auth_user_created.*

### Tabla: usage

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK |
| user_id | uuid | FK a auth.users |
| month | varchar(7) | Mes en formato '2026-02' |
| responses_count | integer | Respuestas del mes (default 0) |
| created_at | timestamp | |
| updated_at | timestamp | |

*UNIQUE(user_id, month). Se incrementa via UPSERT después de cada transcripción exitosa.*

### Tabla: projects

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK |
| user_id | uuid | FK a auth.users |
| name | varchar(255) | Nombre del proyecto |
| public_key | varchar(50) | Key pública para el widget (proj_xxx) |
| language | varchar(5) | Idioma principal (es, en, pt) |
| transcription_mode | enum | 'realtime' \| 'batch' |
| created_at | timestamp | |
| updated_at | timestamp | |
| settings | jsonb | Configuraciones adicionales |

### Tabla: recordings

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK |
| project_id | uuid | FK a projects |
| session_id | varchar(100) | ID de sesión de Alchemer (índice) |
| question_id | varchar(50) | ID de pregunta (opcional) |
| audio_path | text | Path en Supabase Storage |
| audio_size_bytes | int | Tamaño del archivo |
| duration_seconds | int | Duración del audio |
| transcription | text | Texto transcrito (null si pending) |
| input_method | varchar(10) | 'voice' o 'text' (default 'voice') |
| language_detected | varchar(5) | Idioma detectado por Whisper |
| status | enum | pending, processing, completed, failed |
| error_message | text | Si falló, el mensaje de error |
| created_at | timestamp | Cuando se subió |
| transcribed_at | timestamp | Cuando se completó la transcripción |
| batch_id | uuid | FK a batches (si fue transcrito en batch) |

### Tabla: transcription_batches

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK |
| project_id | uuid | FK a projects |
| user_id | uuid | FK a auth.users (quien lo creó) |
| status | enum | pending_confirmation, processing, completed, partial, cancelled |
| total_recordings | int | Total de audios a transcribir |
| completed_count | int | Audios transcritos exitosamente |
| failed_count | int | Audios con error |
| estimated_cost_usd | decimal | Costo estimado |
| actual_cost_usd | decimal | Costo real (post-proceso) |
| session_ids_requested | text[] | Lista de session_ids solicitados |
| session_ids_not_found | text[] | Session IDs sin audio |
| created_at | timestamp | |
| confirmed_at | timestamp | Cuando el usuario confirmó |
| completed_at | timestamp | |

### Índices Recomendados

```sql
-- Búsqueda rápida por session_id
CREATE INDEX idx_recordings_session_id ON recordings(session_id);

-- Filtrar por proyecto y estado
CREATE INDEX idx_recordings_project_status ON recordings(project_id, status);

-- Buscar batches activos
CREATE INDEX idx_batches_project_status ON transcription_batches(project_id, status);
```

### Row Level Security (RLS)

```sql
-- Los usuarios solo ven sus proyectos
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_user_policy ON projects
  FOR ALL USING (user_id = auth.uid());

-- Los usuarios solo ven recordings de sus proyectos
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY recordings_user_policy ON recordings
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

-- Los usuarios solo ven sus batches
ALTER TABLE transcription_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY batches_user_policy ON transcription_batches
  FOR ALL USING (user_id = auth.uid());
```

---

## Costos Estimados

### Por Proyecto (estimado 500 respuestas de audio, 1 min promedio)

| Concepto | Cálculo | Costo |
|----------|---------|-------|
| Whisper API | 500 audios × 1 min × $0.006/min | $3.00 |
| Supabase Storage | 500MB (~500 audios) | Incluido en Free tier |
| Supabase DB | Consultas y storage | Incluido en Free tier |
| Railway (API) | Uso estimado | ~$5/mes |
| **Total por proyecto** | | **~$3.00** (solo Whisper) |

### Supabase Free Tier Incluye
- 1GB Database
- 1GB Storage
- 50,000 monthly active users
- 500MB bandwidth

### Límites antes de pagar
- ~1,000 audios de 1MB cada uno
- Después: Supabase Pro ($25/mes) o limpiar audios antiguos

### Modelo de Pricing (v1.7)

| | Free | Freelancer ($39/mo) | Pro ($199/mo) | Enterprise ($499/mo) |
|---|------|---------------------|---------------|----------------------|
| Respuestas/mes | 100 | 1,000 | 10,000 | 50,000 |
| Costo/respuesta | $0 | $0.039 | $0.020 | $0.010 |
| Proyectos | 2 | 10 | Ilimitados | Ilimitados |
| Duracion max | 90s | 180s | 300s | 600s |
| Idiomas | Solo espanol | 9 principales | Todos (36) | Todos (36) |
| Export | CSV | CSV + XLSX | CSV + XLSX + API | CSV + XLSX + API |
| Batch | No | Si | Si | Si |
| Widget branding | "Powered by Survey Genius" | Sin branding | White-label | White-label |
| Temas custom | No | No | Si | Si |
| Dominios custom | No | No | Si | Si |

**Margenes estimados:**

| Tier | Revenue | Costo Whisper | Infra | Total costo | Margen |
|------|---------|---------------|-------|-------------|--------|
| Free | $0 | $0.45 | $0.05 | $0.50 | Marketing |
| Freelancer | $39 | $4.50 | $5.00 | $9.50 | **76%** |
| Pro | $199 | $45.00 | $45.00 | $90.00 | **55%** |
| Enterprise | $499 | $225.00 | $50.00 | $275.00 | **45%** |

**Enforcement:**
- `validateProjectKey` middleware verifica plan + usage en cada request
- Respuestas sobre cuota retornan HTTP 429
- Proyectos sobre limite retornan HTTP 403
- Idiomas no permitidos retornan HTTP 403

---

## Criterios de Aceptación MVP

### Funcionales - Core

- [ ] Usuario puede crear cuenta (Supabase Auth)
- [ ] Usuario puede crear proyecto y obtener snippet
- [ ] Usuario puede elegir modo: Real-Time o Batch
- [ ] Widget se renderiza correctamente en Alchemer
- [ ] Widget captura Session ID automáticamente
- [ ] Respondente puede grabar audio (hasta 3 min)
- [ ] Respondente puede escuchar preview antes de enviar
- [ ] Respondente puede re-grabar si no le gustó
- [ ] Audio se sube a Supabase Storage correctamente
- [ ] Dashboard muestra lista de grabaciones con estado

### Funcionales - Modo Real-Time

- [ ] Transcripción inicia automáticamente al subir
- [ ] Transcripción completa en < 1 minuto para audio de 1 min
- [ ] Usuario ve transcripción en dashboard

### Funcionales - Modo Batch

- [ ] Audios se guardan sin transcribir (status: pending)
- [ ] Usuario puede subir CSV o pegar lista de session_ids
- [ ] Sistema muestra resumen: encontrados, no encontrados, costo
- [ ] Usuario confirma y sistema transcribe en batch
- [ ] Usuario puede ver progreso del batch

### Funcionales - Export

- [ ] Usuario puede descargar CSV con transcripciones
- [ ] CSV incluye session_id para JOIN con Alchemer
- [ ] Usuario puede escuchar audios desde dashboard
- [ ] Usuario puede re-transcribir audios individuales

### No Funcionales

- [ ] Widget carga en < 2 segundos
- [ ] Upload de audio funciona hasta 10MB
- [ ] API responde en < 500ms (sin contar transcripción)
- [ ] Dashboard carga en < 3 segundos
- [ ] 99% uptime

### Compatibilidad

- [ ] Chrome 90+ (desktop y mobile)
- [ ] Firefox 88+
- [ ] Safari 14+ (desktop y iOS)
- [ ] Edge 90+

---

## Limitaciones del MVP

| Limitación | Razón | Solución Futura |
|------------|-------|-----------------|
| Solo 1 pregunta de audio por encuesta | Simplificar MVP | Múltiples widgets con question_id |
| Sin análisis de sentimiento | MVP | Agregar en v1.1 |
| Sin integración directa con Survey Coder | MVP | API de importación |
| Sin edición manual de transcripciones | MVP | Editor en dashboard |
| Batch requiere subir CSV manualmente | Sin webhook de Alchemer | Considerar webhook opcional |
| JOIN manual con Alchemer | Sin escritura directa | Opción avanzada con hidden field |

---

## Roadmap

### Fase 1: MVP (v1.0-v1.5) -- COMPLETADO
- Widget basico de grabacion (voice.js)
- Modos Real-Time y Batch
- Transcripcion con Whisper (inmediata en endpoint)
- Dashboard con export CSV
- JOIN manual por session_id
- Deploy: Railway (API) + Lovable (Dashboard)

### Fase 1.6-1.7: Tiers + Usage + Dual Mode (v1.6-v1.7) -- COMPLETADO
- 4 planes: Free / Freelancer ($39) / Pro ($199) / Enterprise ($499)
- Usage tracking mensual con enforcement en middleware
- Dashboard de uso (barra de progreso, tabla comparativa 4 tiers)
- Widget v1.6: config fetch, branding badge (Free), temas custom (Pro+)
- Widget v1.7: dual-mode (textarea + dictado), input_method tracking
- POST /api/text-response: endpoint para respuestas escritas (sin Whisper)
- Columna `input_method` en recordings (voice/text)
- CORS dinamico para dominios custom (Pro+)
- Dominio profesional: `api.voicecapture.ai`
- Pricing competitivo validado vs Voxpopme ($40K+/ano), Phonic ($36), Qualtrics ($420)

### Fase 1.8: UX Polish + Data Integrity (v1.8) -- COMPLETADO
- **UPSERT text-response**: 1 recording por (session, question, input_method=text) — sin duplicados
- **Dictado agrega texto**: Transcripcion se agrega al texto existente (no reemplaza)
- **Borrar texto sincroniza**: Texto vacio borra recording en backend
- **lastSavedText after voice**: Previene auto-save duplicado post-dictado
- **Accesibilidad**: aria-label, aria-live, aria-hidden en todos los elementos interactivos
- **Contraste WCAG AA**: Placeholder #71717a (4.7:1), success #15803d (4.8:1), hint #4f46e5 (5.9:1)
- **Touch targets**: min-height 44px en botones (Apple HIG compliant)
- **Focus-visible**: Outline visible para navegacion por teclado
- **Lifecycle events**: geniusvoice:ready, recording-start, recording-stop, transcribed, text-saved, error
- **Error con retry hint**: Mensajes de error incluyen texto "Intentar de nuevo"
- **Portugues BR**: "Ditar" → "Gravar" para mercado brasileño
- **Docs actualizados**: Header de voice.js y PRODUCT_SPEC con patron Alchemer correcto (3 pasos)
- **data-target documentado**: Documentacion clara para plataformas no-Alchemer

### Fase 1.9: IP Protection + Security Hardening (v1.9) -- COMPLETADO
- **Widget minification**: voice.js source moved to src/widget/, built with terser to dist/voice.min.js (~60% smaller). Comments, variable names, and integration docs stripped from production.
- **Dynamic widget serving**: /voice.js served via route handler (not express.static). Production serves minified from memory cache; dev serves readable source with no-cache.
- **Domain locking**: Per-project `settings.allowed_domains` restricts which domains can use a project key. Validated in both `validateProjectKey` middleware and `widget-config` endpoint. Supports wildcards (*.alchemer.com). localhost always allowed for dev. Empty = allow all (backward compatible).
- **Domain management API**: GET/PUT `/api/projects/:id/allowed-domains` for dashboard-friendly domain configuration.
- **CORS update**: Added `encuestas.genius-labs.com.co` + `*.genius-labs.com.co` wildcard.
- **Build pipeline**: `npm run build` runs terser; Railway auto-runs before start.

### Fase 2: Mejoras UX
- Multiples preguntas de audio por encuesta
- Analisis de sentimiento (Whisper detecta tono)
- Integracion con Survey Coder PRO (importar transcripciones)
- Integracion de pagos (Stripe) para upgrade de planes

### Fase 3: Integraciones
- Integracion directa con Survey Coder PRO
- Webhook para notificar cuando transcripcion esta lista
- Analisis de sentimiento automatico

### Fase 4: Conversacional
- Agente de voz para repreguntas en tiempo real
- Integracion con sistema de repreguntas actual
- Voice-to-voice (sin texto intermedio)

---

## Riesgos y Mitigaciones

| Riesgo | Impacto | Probabilidad | Mitigación |
|--------|---------|--------------|------------|
| Permisos de micrófono denegados | Alto | Media | UI clara explicando por qué se necesita |
| Audios muy largos (>5 min) | Medio | Baja | Límite configurable + mensaje claro |
| Whisper falla temporalmente | Alto | Baja | Cola con retry automático |
| Session ID no disponible | Alto | Baja | Fallback a URL params o campo manual |
| Audio inaudible/ruido | Medio | Media | Detector de nivel + advertencia |

---

## Estimación de Desarrollo

### Backend (Claude Code + Railway)

| Componente | Esfuerzo | Prioridad |
|------------|----------|-----------|
| Setup proyecto + Supabase | 1 día | P0 |
| Endpoint POST /upload | 2 días | P0 |
| Integración Whisper | 2 días | P0 |
| Cola de transcripción (Edge Functions) | 2 días | P0 |
| Endpoints CRUD recordings | 2 días | P0 |
| Endpoint batch transcribe | 2 días | P0 |
| Endpoint export CSV | 1 día | P0 |
| **Subtotal Backend** | **~2 semanas** | |

### Frontend - Dashboard (Lovable)

| Componente | Esfuerzo | Prioridad |
|------------|----------|-----------|
| Auth (login/registro con Supabase) | 1 día | P0 |
| Crear proyecto + snippet | 1 día | P0 |
| Lista de grabaciones | 2 días | P0 |
| Player de audio | 1 día | P0 |
| Subir CSV para batch | 2 días | P0 |
| Pantalla de confirmación batch | 1 día | P0 |
| Progreso de batch | 1 día | P0 |
| Export CSV/Excel | 1 día | P0 |
| **Subtotal Dashboard** | **~2 semanas** | |

### Widget (voice.js)

| Componente | Esfuerzo | Prioridad |
|------------|----------|-----------|
| MediaRecorder + UI básica | 2 días | P0 |
| Captura Session ID de Alchemer | 1 día | P0 |
| Upload a API | 1 día | P0 |
| Preview + re-grabar | 1 día | P0 |
| Manejo de errores + UX | 1 día | P0 |
| Testing cross-browser | 2 días | P0 |
| **Subtotal Widget** | **~1.5 semanas** | |

### Resumen Total MVP

| Fase | Duración | Responsable |
|------|----------|-------------|
| Backend API | 2 semanas | Claude Code |
| Dashboard | 2 semanas | Lovable |
| Widget | 1.5 semanas | Claude Code |
| Testing + fixes | 1 semana | Ambos |
| **Total** | **~6-7 semanas** | |

*Asumiendo trabajo paralelo en backend y frontend después del setup inicial.*

---

## Métricas de Éxito

| Métrica | Target | Cómo medir |
|---------|--------|------------|
| Setup completado | 80% de usuarios que inician | Funnel analytics |
| Tasa de grabación | 70% de respondentes que ven el widget | Events en widget |
| Transcripción exitosa | 99% | Logs de errores |
| Tiempo de transcripción | < 2 min para audios de 3 min | Métricas de cola |
| NPS del producto | > 40 | Survey post-uso |

---

*Este documento se actualiza según avanza el desarrollo de Voice Capture MVP.*
