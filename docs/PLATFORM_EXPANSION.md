# Genius Voice Capture — Expansión Multi-Plataforma

> Documento de análisis y guía de implementación para el equipo de desarrollo.
> Fecha: 2026-02-22

## Resumen Ejecutivo

El widget Voice Capture fue diseñado inicialmente para Alchemer, pero su arquitectura (vanilla JS, Shadow DOM, IIFE sin dependencias, custom events) lo hace **compatible con prácticamente cualquier plataforma web** que permita inyectar JavaScript. Este documento detalla las plataformas candidatas, los cambios técnicos necesarios y la estrategia de implementación.

---

## 1. Por qué expandir a múltiples plataformas

### Situación actual
- El widget solo tiene integración documentada y probada con **Alchemer**
- Los dominios CORS (`wildcardPatterns` en `src/config/index.js`) solo incluyen `*.alchemer.com`, `*.alchemer.eu` y `*.surveygizmo.com`
- La documentación del widget (`voice.js` header, `helpChatSystem.js`) se enfoca exclusivamente en Alchemer

### Oportunidad
- El widget es **técnicamente agnóstico** — funciona en cualquier página HTTPS con JavaScript
- El mercado de encuestas y formularios es fragmentado: ninguna plataforma tiene más del 30% del mercado
- Cada plataforma soportada multiplica el mercado direccionable
- El posicionamiento cambia de "herramienta para Alchemer" a "captura de voz para encuestas y formularios"

### Beneficios del reposicionamiento
| Enfoque actual | Enfoque propuesto |
|---|---|
| "Voice capture para Alchemer" | "Voice capture para encuestas y formularios" |
| Depende de una sola plataforma | Diversificación de mercado |
| Landing page única | SEO long-tail por plataforma |
| Si el usuario migra de Alchemer, pierde el producto | El producto sobrevive migraciones de plataforma |

---

## 2. Requisitos técnicos de compatibilidad

Para que una plataforma sea compatible, necesita soportar:

| Requisito | Razón | Obligatorio |
|---|---|---|
| Inyección de `<script>` externo | Cargar `voice.js` | Sí |
| Ejecución de JavaScript custom | Configurar `data-*` attributes y llamar `GeniusVoice.init()` | Sí |
| HTTPS | `MediaRecorder` API solo funciona sobre HTTPS | Sí |
| Acceso al DOM | Insertar el `<div>` contenedor y leer campos de formulario | Sí |
| `data-*` attributes o JS dinámico | Configurar el widget | Uno de los dos |
| Custom events o `data-target` | Capturar la transcripción en el formulario de la plataforma | Uno de los dos |

### Mecanismos de integración existentes en el widget

El widget ya ofrece dos caminos para plataformas no-Alchemer:

**Opción A — `data-target`:** El atributo `data-target` acepta un selector CSS del campo de formulario destino. El widget escribe la transcripción directamente en ese campo.

**Opción B — Custom Events:** La plataforma escucha `geniusvoice:transcribed` y maneja la respuesta con código custom.

```javascript
document.addEventListener('geniusvoice:transcribed', (e) => {
  const { text, questionId, sessionId } = e.detail;
  // Escribir en el campo de formulario de la plataforma
});
```

---

## 3. Análisis de plataformas candidatas

### Tier 1 — Compatibilidad alta, alta prioridad

#### Qualtrics
| Aspecto | Detalle |
|---|---|
| **Mecanismo de script global** | Header/Footer JS en Look & Feel |
| **JS por pregunta** | "Add JavaScript" en cada pregunta |
| **Session ID** | `${e://Field/ResponseID}` (embedded data) |
| **Acceso DOM** | Completo |
| **Mercado** | Enterprise, academia, investigación — muy grande |
| **Dificultad de integración** | Baja (muy similar a Alchemer) |
| **Dominio CORS** | `*.qualtrics.com` |

#### SurveyMonkey
| Aspecto | Detalle |
|---|---|
| **Mecanismo de script global** | Custom HTML en diseño de encuesta |
| **JS por pregunta** | Custom HTML question type |
| **Session ID** | `[respondent_id]` merge code |
| **Acceso DOM** | Limitado pero funcional |
| **Mercado** | Mayor base de usuarios del mundo en encuestas online |
| **Dificultad de integración** | Media |
| **Dominio CORS** | `*.surveymonkey.com` |

#### QuestionPro
| Aspecto | Detalle |
|---|---|
| **Mecanismo de script global** | "Custom JS" en herramientas de encuesta |
| **JS por pregunta** | Pre/Post JavaScript Logic por pregunta |
| **Session ID** | Variable de respondente (merge code) |
| **Acceso DOM** | Completo |
| **Mercado** | Fuerte en Latinoamérica (alineado con mercado hispanohablante) |
| **Dificultad de integración** | Baja-Media |
| **Dominio CORS** | `*.questionpro.com` |

#### JotForm
| Aspecto | Detalle |
|---|---|
| **Mecanismo de script global** | Settings > Custom Code > Header |
| **JS por pregunta** | Embed Code widget en el formulario |
| **Session ID** | `{submission_id}` |
| **Acceso DOM** | Completo |
| **Mercado** | Popular en SMBs y freelancers |
| **Dificultad de integración** | Baja |
| **Dominio CORS** | `*.jotform.com` |

### Tier 2 — Compatibilidad media, oportunidad de nicho

#### WordPress (plugin)
| Aspecto | Detalle |
|---|---|
| **Integración** | Plugin WP que inyecta el widget via shortcode `[genius-voice project="proj_xxx"]` |
| **Mercado** | 40%+ de sitios web del mundo |
| **Caso de uso** | Formularios de contacto, reviews, testimonios de voz |
| **Dificultad** | Media (requiere desarrollar plugin) |
| **Dominio CORS** | Cualquiera (custom domains del usuario) |

#### Moodle / LMS
| Aspecto | Detalle |
|---|---|
| **Integración** | Plugin Moodle o embed HTML en preguntas de examen |
| **Mercado** | Educación, universidades, e-learning |
| **Caso de uso** | Respuestas de voz en evaluaciones, accesibilidad |
| **Dificultad** | Media-Alta (ecosistema de plugins Moodle) |
| **Dominio CORS** | Cualquiera (instancias self-hosted) |

#### Formstack
| Aspecto | Detalle |
|---|---|
| **Integración** | Theme Editor con JS custom |
| **Mercado** | Empresas medianas, automatización |
| **Dificultad** | Media |
| **Dominio CORS** | `*.formstack.com` |

### Tier 3 — Compatibilidad limitada

| Plataforma | Problema | Solución posible |
|---|---|---|
| **Google Forms** | No permite JS custom ni HTML personalizado | Widget en iframe externo que envíe datos via postMessage |
| **Microsoft Forms** | No permite JS externo | Mismo enfoque iframe |
| **Tally** | JS limitado en embeds | `data-target` con embed HTML block |

---

## 4. Cambios técnicos necesarios

### 4.1 CORS — Agregar dominios (Prioridad: Alta)

**Archivo:** `src/config/index.js`

Agregar a `wildcardPatterns`:

```javascript
wildcardPatterns: [
    // Existentes
    /^https:\/\/.*\.lovable\.app$/,
    /^https:\/\/.*\.alchemer\.com$/,
    /^https:\/\/.*\.alchemer\.eu$/,
    /^https:\/\/.*\.surveygizmo\.com$/,
    /^https:\/\/.*\.genius-labs\.com\.co$/,
    // Nuevas plataformas
    /^https:\/\/.*\.qualtrics\.com$/,
    /^https:\/\/.*\.surveymonkey\.com$/,
    /^https:\/\/.*\.questionpro\.com$/,
    /^https:\/\/.*\.jotform\.com$/,
    /^https:\/\/.*\.formstack\.com$/,
    /^https:\/\/.*\.typeform\.com$/
]
```

**Esfuerzo:** ~15 minutos. Sin riesgo.

### 4.2 Detección de plataforma en el widget (Prioridad: Media)

**Archivo:** `src/widget/voice.js`

Actualmente el widget tiene lógica específica para Alchemer (busca `.sg-question-options textarea`). Para multi-plataforma, agregar detección automática:

```javascript
function detectPlatform() {
    const host = window.location.hostname;
    if (/alchemer\.com|surveygizmo\.com/.test(host)) return 'alchemer';
    if (/qualtrics\.com/.test(host)) return 'qualtrics';
    if (/surveymonkey\.com/.test(host)) return 'surveymonkey';
    if (/questionpro\.com/.test(host)) return 'questionpro';
    if (/jotform\.com/.test(host)) return 'jotform';
    return 'generic';
}

function findFormField(platform, container) {
    const selectors = {
        alchemer: '.sg-question-options textarea, .sg-question-options input[type="text"]',
        qualtrics: '.QuestionBody textarea, .QuestionBody input[type="text"]',
        surveymonkey: '.question-body textarea, .question-body input[type="text"]',
        questionpro: '.question-container textarea, .question-container input[type="text"]',
        jotform: '.form-line textarea, .form-line input[type="text"]',
        generic: null // Usa data-target o custom events
    };
    const selector = selectors[platform];
    if (!selector) return null;
    const parent = container.closest('.question, .QuestionOuter, [data-question-id]') || container.parentElement;
    return parent ? parent.querySelector(selector) : null;
}
```

**Esfuerzo:** ~2-4 horas. Requiere testing en cada plataforma.

### 4.3 Session ID — Documentar merge codes por plataforma (Prioridad: Alta)

Cada plataforma tiene su propio mecanismo para inyectar el ID de respondente:

| Plataforma | Merge code / variable | Ejemplo en JS Action |
|---|---|---|
| Alchemer | `[survey("session id")]` | `c.dataset.session = '[survey("session id")]';` |
| Qualtrics | `${e://Field/ResponseID}` | `c.dataset.session = '${e://Field/ResponseID}';` |
| SurveyMonkey | `[respondent_id]` | `c.dataset.session = '[respondent_id]';` |
| QuestionPro | Variable de respondente | `c.dataset.session = getRespondentID();` |
| JotForm | `{submission_id}` | `c.dataset.session = '{submission_id}';` |
| Genérico | URL param o generado | `c.dataset.session = crypto.randomUUID();` |

**Esfuerzo:** Documentación, no código.

### 4.4 Help Chat — Expandir conocimiento del AI (Prioridad: Media)

**Archivo:** `src/prompts/helpChatSystem.js`

Agregar guías de integración para cada plataforma al system prompt del chat de ayuda, para que el AI asistente pueda guiar usuarios de cualquier plataforma.

**Esfuerzo:** ~2-3 horas.

### 4.5 Widget Config — Platform field (Prioridad: Baja)

Agregar campo `platform` opcional al proyecto para optimizar la experiencia:

```javascript
// En el widget config response, agregar:
{
    "platform": "qualtrics",     // Opcional, default "generic"
    "max_duration": 120,
    "language": "es",
    // ...
}
```

El widget usaría este valor en lugar de auto-detectar por hostname.

**Esfuerzo:** ~1 hora backend + widget.

---

## 5. Estrategia de landing pages

### Estructura propuesta

```
voiceapi.survey-genius.ai/
├── /                           → Página principal (beneficios de voz)
├── /integrations               → Listado de todas las integraciones
├── /integrations/alchemer      → Guía Alchemer (existente)
├── /integrations/qualtrics     → Guía Qualtrics
├── /integrations/surveymonkey  → Guía SurveyMonkey
├── /integrations/questionpro   → Guía QuestionPro
├── /integrations/jotform       → Guía JotForm
├── /integrations/wordpress     → Guía WordPress
└── /integrations/generic       → Guía genérica (cualquier web)
```

### Página principal — Mensajes clave

**Título:** "Captura respuestas de voz en tus encuestas y formularios"

**Propuesta de valor (no atada a plataforma):**
- Respuestas 3-5x más largas y detalladas que texto
- Mayor tasa de completación de encuestas
- Captura emociones y matices que el texto pierde
- Accesibilidad para personas que no pueden o prefieren no escribir
- Transcripción automática con IA (Whisper)
- Multilingüe (español, inglés, portugués y más)
- Se integra en minutos con tu plataforma favorita
- Sin dependencias, funciona en cualquier página web

### Páginas por plataforma — Contenido

Cada página de integración debe incluir:
1. **Tutorial paso a paso** con screenshots de la plataforma específica
2. **Código copy-paste** adaptado (merge codes, selectores CSS)
3. **Video corto** mostrando la integración en acción
4. **SEO keywords:** "voice capture for [plataforma]", "audio responses [plataforma]"
5. **CTA:** "Prueba gratis → crea tu proyecto → copia el código"

### SEO esperado

Cada landing captura búsquedas long-tail:
- "how to add voice responses to Qualtrics surveys"
- "captura de audio en encuestas SurveyMonkey"
- "QuestionPro voice transcription integration"
- "audio feedback JotForm"

---

## 6. Plan de implementación por fases

### Fase 1 — Fundamentos (1-2 semanas)
- [ ] Agregar dominios CORS de Tier 1 (`src/config/index.js`)
- [ ] Probar widget manualmente en Qualtrics, SurveyMonkey, QuestionPro, JotForm
- [ ] Documentar merge codes de session ID por plataforma
- [ ] Crear guía de integración genérica (non-Alchemer) en `agent_docs/`

### Fase 2 — Widget multi-plataforma (2-3 semanas)
- [ ] Implementar `detectPlatform()` en `voice.js`
- [ ] Implementar `findFormField()` con selectores por plataforma
- [ ] Probar auto-detección de campos en cada plataforma
- [ ] Agregar fallback robusto: si no encuentra campo nativo → usar `data-target` → usar custom events
- [ ] Actualizar system prompt del AI chat (`helpChatSystem.js`)

### Fase 3 — Landing pages (2-3 semanas)
- [ ] Diseñar página principal enfocada en beneficios de voz (frontend dashboard)
- [ ] Crear template de landing por plataforma
- [ ] Landing Alchemer (refinar la existente)
- [ ] Landing Qualtrics
- [ ] Landing QuestionPro
- [ ] Landing SurveyMonkey
- [ ] Landing JotForm
- [ ] Landing genérica

### Fase 4 — Expansión (continuo)
- [ ] Plugin WordPress
- [ ] Plugin/integración Moodle
- [ ] Landing pages adicionales (Formstack, Typeform)
- [ ] Modo iframe para plataformas restrictivas (Google Forms, Microsoft Forms)

---

## 7. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Plataforma bloquea scripts externos | Widget no carga | Probar antes de crear landing; marcar plataforma como "no compatible" |
| Selectores CSS cambian con updates | Widget no encuentra campo de formulario | Usar `data-target` como fallback; monitorear cambios |
| Plataforma sanitiza `data-*` attrs | Configuración perdida | Ya resuelto: JS dinámico como en Alchemer |
| CORS rechaza origin desconocido | Widget no puede enviar audio | Wildcard patterns cubren subdominios |
| Rate limiting por plataforma | Muchos respondentes simultáneos | Rate limits actuales (100 req/15min por IP) son suficientes |

---

## 8. Métricas de éxito

| Métrica | Cómo medir |
|---|---|
| Plataformas soportadas | Número de integraciones probadas y documentadas |
| Adopción por plataforma | `recordings` agrupados por dominio de origen (header `Origin`) |
| Tráfico por landing | Analytics en `/integrations/*` |
| Conversión por plataforma | Registros con atribución a landing de integración |
| Retención cross-plataforma | Usuarios que usan el widget en más de una plataforma |

---

## 9. Archivos clave a modificar

| Archivo | Cambio | Fase |
|---|---|---|
| `src/config/index.js` | Agregar wildcard CORS patterns | 1 |
| `src/widget/voice.js` | `detectPlatform()`, `findFormField()` multi-plataforma | 2 |
| `src/prompts/helpChatSystem.js` | Guías de integración por plataforma en AI chat | 2 |
| `src/routes/widgetConfig.js` | Campo `platform` opcional en respuesta | 2 |
| `agent_docs/` | Documentación de integración genérica | 1 |
| Frontend dashboard | Landing pages | 3 |
