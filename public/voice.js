/**
 * Genius Voice Capture Widget v1.7
 * Dual-mode widget: Textarea (default) + Voice dictation
 * Standalone widget for embedding voice recording in surveys (Alchemer, etc.)
 *
 * Usage — Alchemer JavaScript Action (recommended):
 *   Paste this JS in the JavaScript Action field:
 *
 *   var c=document.createElement('div');
 *   c.dataset.project='proj_xxx';
 *   c.dataset.session='SESSION_ID';
 *   c.dataset.question='q1';
 *   c.dataset.lang='es';
 *   var s=document.scripts;
 *   s[s.length-1].parentNode.appendChild(c);
 *   if(window.GeniusVoice){GeniusVoice.init(c)}
 *   else{var j=document.createElement('script');
 *   j.src='https://voiceapi.survey-genius.ai/voice.js';
 *   document.head.appendChild(j)}
 *
 * Usage — HTML embed (generic platforms):
 *   <div id="genius-voice" data-project="proj_xxx" data-session="SESSION_ID"
 *        data-question="q1" data-lang="es"></div>
 *   <script src="https://voiceapi.survey-genius.ai/voice.js"></script>
 */
(function () {
    'use strict';

    // Capture script reference immediately (before any async)
    var scriptTag = document.currentScript;

    /**
     * Initialize a single container element as a widget.
     * Can be called externally via window.GeniusVoice.init(el)
     */
    function initContainer(container) {
        if (!container || !container.dataset) return;
        if (container.dataset.gvInit === '1') return; // already initialized
        if (!container.dataset.project) {
            console.warn('[GeniusVoice] Container missing data-project attribute');
            return;
        }
        container.dataset.gvInit = '1';
        initWidget(container);
    }

    /**
     * Scan the page for all uninitialized containers and init them.
     * Called on first load and can be called externally via window.GeniusVoice.scan()
     */
    function scanAndInit() {
        // Find all elements with data-project (excluding script tags and already-init'd)
        var containers = document.querySelectorAll('[data-project^="proj_"]:not(script):not([data-gv-init="1"])');
        for (var i = 0; i < containers.length; i++) {
            initContainer(containers[i]);
        }

        // If nothing found and we have a script tag with data-project, auto-create
        if (containers.length === 0 && scriptTag && scriptTag.dataset.project) {
            var container = document.createElement('div');
            var attrs = ['project', 'session', 'question', 'lang', 'maxDuration', 'api', 'target'];
            for (var j = 0; j < attrs.length; j++) {
                if (scriptTag.dataset[attrs[j]]) {
                    container.dataset[attrs[j]] = scriptTag.dataset[attrs[j]];
                }
            }
            if (scriptTag.parentNode) {
                scriptTag.parentNode.insertBefore(container, scriptTag);
                initContainer(container);
            }
        }
    }

    // Expose global API for dynamic loading (Alchemer JS Actions)
    window.GeniusVoice = {
        init: initContainer,
        scan: scanAndInit
    };

    function initWidget(container) {
        var projectKey = container.dataset.project;
        if (!projectKey) {
            console.error('[GeniusVoice] Missing data-project attribute');
            return;
        }

        var sessionId = container.dataset.session || getSessionFromUrl() || generateFallbackId();
        var questionId = container.dataset.question || null;
        var maxDuration = parseInt(container.dataset.maxDuration, 10) || 120;
        var lang = container.dataset.lang || 'es';
        var apiUrl = container.dataset.api || getScriptOrigin() || 'https://voiceapi.survey-genius.ai';
        var targetSelector = container.dataset.target || null;

        // --- i18n ---
        var texts = {
            es: {
                placeholder: 'Escribe tu respuesta aqu\u00ed...',
                dictate: 'Dictar',
                stop: 'Detener',
                recording: 'Grabando...',
                transcribing: 'Transcribiendo...',
                transcribingLong: 'Procesando, un momento...',
                saved: 'Respuesta guardada',
                editing: 'Puedes editar antes de continuar',
                error: 'Error al transcribir',
                retry: 'Intentar de nuevo',
                permissionDenied: 'Se necesita acceso al micr\u00f3fono',
                notSupported: 'Tu navegador no soporta grabaci\u00f3n de audio',
                maxReached: 'Duraci\u00f3n m\u00e1xima alcanzada'
            },
            en: {
                placeholder: 'Type your answer here...',
                dictate: 'Dictate',
                stop: 'Stop',
                recording: 'Recording...',
                transcribing: 'Transcribing...',
                transcribingLong: 'Processing, one moment...',
                saved: 'Answer saved',
                editing: 'You can edit before continuing',
                error: 'Transcription error',
                retry: 'Try again',
                permissionDenied: 'Microphone access required',
                notSupported: 'Your browser does not support audio recording',
                maxReached: 'Maximum duration reached'
            },
            pt: {
                placeholder: 'Digite sua resposta aqui...',
                dictate: 'Ditar',
                stop: 'Parar',
                recording: 'Gravando...',
                transcribing: 'Transcrevendo...',
                transcribingLong: 'Processando, um momento...',
                saved: 'Resposta salva',
                editing: 'Voc\u00ea pode editar antes de continuar',
                error: 'Erro na transcri\u00e7\u00e3o',
                retry: 'Tentar novamente',
                permissionDenied: '\u00c9 necess\u00e1rio acesso ao microfone',
                notSupported: 'Seu navegador n\u00e3o suporta grava\u00e7\u00e3o de \u00e1udio',
                maxReached: 'Dura\u00e7\u00e3o m\u00e1xima atingida'
            }
        };
        var t = texts[lang] || texts.es;

        // --- State ---
        var state = 'idle'; // idle | recording | uploading | error
        var mediaRecorder = null;
        var audioChunks = [];
        var timerInterval = null;
        var seconds = 0;
        var errorMsg = '';
        var showBranding = false;
        var configLoaded = false;
        var voiceJustFinished = false; // true after voice transcription fills textarea
        var textSaved = false; // true after text auto-saved to backend
        var textSaving = false; // true while auto-save in flight
        var autoSaveTimer = null; // debounce timer for auto-save
        var lastSavedText = ''; // track what was last saved to avoid duplicates

        // --- DOM refs (set during render) ---
        var textareaEl = null;
        var statusEl = null;

        // --- Write transcription to host form field ---
        function writeToFormField(text) {
            var targetEl = null;
            try {
                if (targetSelector) {
                    targetEl = document.querySelector(targetSelector);
                }
                if (!targetEl && container.parentElement) {
                    targetEl = container.parentElement.querySelector(
                        '.sg-question-options textarea, .sg-question-options input[type="text"]'
                    );
                }
                if (targetEl) {
                    targetEl.value = text || '';
                    targetEl.dispatchEvent(new Event('input', { bubbles: true }));
                    targetEl.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } catch (e) {
                console.warn('[GeniusVoice] Could not write to form field:', e);
            }
            try {
                container.dispatchEvent(new CustomEvent('geniusvoice:transcribed', {
                    bubbles: true,
                    detail: { text: text || '', questionId: questionId, sessionId: sessionId }
                }));
            } catch (e) { /* CustomEvent not supported */ }
        }

        // --- Hide host form field (widget replaces the textarea visually) ---
        try {
            if (container.parentElement) {
                var hostField = container.parentElement.querySelector('.sg-question-options');
                if (hostField) hostField.style.cssText = 'height:0;overflow:hidden;opacity:0;pointer-events:none;margin:0;padding:0;';
            }
        } catch (e) { /* non-Alchemer environment, ignore */ }

        // --- Shadow DOM ---
        if (typeof container.attachShadow !== 'function') {
            container.textContent = t.notSupported;
            return;
        }
        var shadow = container.attachShadow({ mode: 'closed' });

        var styleEl = document.createElement('style');
        styleEl.textContent = getStyles();
        shadow.appendChild(styleEl);

        var wrapper = document.createElement('div');
        wrapper.className = 'gv-widget';
        shadow.appendChild(wrapper);

        // --- Render ---
        function render() {
            wrapper.innerHTML = '';

            // Always render textarea (disabled during recording/uploading)
            var ta = el('textarea', {
                className: 'gv-textarea',
                placeholder: state === 'recording' ? t.recording : state === 'uploading' ? t.transcribing : t.placeholder
            });
            ta.rows = 3;
            if (state === 'recording' || state === 'uploading') {
                ta.disabled = true;
                ta.classList.add('gv-textarea-disabled');
            }
            // Preserve textarea value
            if (textareaEl && textareaEl.value) {
                ta.value = textareaEl.value;
            }
            wrapper.appendChild(ta);
            textareaEl = ta;

            // Sync to form field on input + schedule auto-save
            ta.addEventListener('input', function () {
                writeToFormField(ta.value);
                scheduleAutoSave();
            });

            // Auto-save on blur (user clicks Next, clicks elsewhere, etc.)
            ta.addEventListener('blur', function () {
                autoSaveText();
            });

            // Status message area
            var stArea = el('div', { className: 'gv-status' });
            wrapper.appendChild(stArea);
            statusEl = stArea;

            // Recording indicator (timer + pulse)
            if (state === 'recording') {
                var indicator = el('div', { className: 'gv-recording-indicator' });
                indicator.innerHTML = '<span class="gv-pulse"></span> <span class="gv-timer">' + formatTime(seconds) + '</span>';
                stArea.appendChild(indicator);
            }

            // Uploading spinner
            if (state === 'uploading') {
                var uploading = el('div', { className: 'gv-uploading' });
                var elapsed = uploadStartedAt ? (Date.now() - uploadStartedAt) / 1000 : 0;
                var msg = elapsed > 15 ? t.transcribingLong : t.transcribing;
                uploading.innerHTML = '<div class="gv-spinner"></div><span>' + msg + '</span>';
                stArea.appendChild(uploading);
            }

            // Editing hint after voice transcription
            if (voiceJustFinished && state === 'idle') {
                var hint = el('div', { className: 'gv-msg gv-editing-hint' });
                hint.textContent = t.editing;
                stArea.appendChild(hint);
            }

            // Saved confirmation (brief)
            if (textSaved && state === 'idle') {
                var savedMsg = el('div', { className: 'gv-msg gv-success-msg' });
                savedMsg.innerHTML = checkSvgSmall() + ' ' + t.saved;
                stArea.appendChild(savedMsg);
            }

            // Error message
            if (state === 'error') {
                var errEl = el('div', { className: 'gv-msg gv-error-msg' });
                errEl.textContent = errorMsg || t.error;
                stArea.appendChild(errEl);
            }

            // Action buttons row
            var actions = el('div', { className: 'gv-actions' });
            wrapper.appendChild(actions);

            var hasMic = navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== 'undefined';

            if (state === 'idle' || state === 'error') {
                // Mic/dictate button
                if (hasMic) {
                    var micBtn = el('button', { className: 'gv-btn gv-btn-mic', onclick: startRecording });
                    micBtn.innerHTML = micSvg() + ' <span>' + t.dictate + '</span>';
                    actions.appendChild(micBtn);
                }
            }

            if (state === 'recording') {
                // Stop button
                var stopBtn = el('button', { className: 'gv-btn gv-btn-stop', onclick: stopRecording });
                stopBtn.innerHTML = stopSvg() + ' <span>' + t.stop + '</span>';
                actions.appendChild(stopBtn);
            }

            renderBranding();
        }

        function renderBranding() {
            if (!showBranding) return;
            var badge = el('div', { className: 'gv-branding' });
            var link = el('a', { href: 'https://survey-genius.ai', target: '_blank' });
            link.textContent = 'Powered by Survey Genius';
            badge.appendChild(link);
            wrapper.appendChild(badge);
        }

        function applyTheme(theme) {
            if (!theme) return;
            var css = [];
            if (theme.primary_color) {
                css.push('.gv-btn-mic{background:' + theme.primary_color + '}');
                css.push('.gv-btn-mic:hover{background:' + theme.primary_color + ';filter:brightness(0.9)}');
                css.push('.gv-spinner{border-top-color:' + theme.primary_color + '}');
            }
            if (theme.background) {
                css.push('.gv-widget{background:' + theme.background + '}');
            }
            if (theme.border_radius != null) {
                css.push('.gv-widget{border-radius:' + theme.border_radius + 'px}');
            }
            if (theme.text_color) {
                css.push('.gv-widget{color:' + theme.text_color + '}');
            }
            if (css.length) {
                var s = document.createElement('style');
                s.textContent = css.join('\n');
                shadow.appendChild(s);
            }
        }

        // --- Auto-save text (on blur + debounce) ---
        function scheduleAutoSave() {
            if (autoSaveTimer) clearTimeout(autoSaveTimer);
            textSaved = false; // reset saved indicator on new input
            autoSaveTimer = setTimeout(function () {
                autoSaveText();
            }, 2000);
        }

        function autoSaveText() {
            if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
            if (!textareaEl || !textareaEl.value.trim()) return;
            if (textSaving) return; // already in flight
            var text = textareaEl.value.trim();
            if (text === lastSavedText) return; // no change since last save

            textSaving = true;

            fetch(apiUrl + '/api/text-response', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-project-key': projectKey
                },
                body: JSON.stringify({
                    session_id: sessionId,
                    question_id: questionId,
                    text: text,
                    language: lang
                })
            })
            .then(function (response) {
                if (!response.ok) throw new Error('Server error: ' + response.status);
                return response.json();
            })
            .then(function (data) {
                textSaving = false;
                if (data.success) {
                    lastSavedText = text;
                    textSaved = true;
                    // Show brief saved indicator
                    if (statusEl) {
                        var savedMsg = document.createElement('div');
                        savedMsg.className = 'gv-msg gv-success-msg';
                        savedMsg.innerHTML = checkSvgSmall() + ' ' + t.saved;
                        statusEl.innerHTML = '';
                        statusEl.appendChild(savedMsg);
                        // Clear after 2s
                        setTimeout(function () {
                            if (textSaved && statusEl) { statusEl.innerHTML = ''; textSaved = false; }
                        }, 2000);
                    }
                }
            })
            .catch(function () {
                textSaving = false;
                // Silent fail — text is still in Alchemer's form field via writeToFormField
            });
        }

        // --- Recording logic ---
        function startRecording() {
            if (state !== 'idle' && state !== 'error') return;
            state = 'recording';
            voiceJustFinished = false;
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(function (stream) {
                    try {
                        var mimeType = getMimeType();
                        var options = mimeType ? { mimeType: mimeType } : {};

                        mediaRecorder = new MediaRecorder(stream, options);
                        audioChunks = [];
                        seconds = 0;

                        mediaRecorder.ondataavailable = function (e) {
                            if (e.data.size > 0) audioChunks.push(e.data);
                        };

                        mediaRecorder.onstop = function () {
                            stream.getTracks().forEach(function (track) { track.stop(); });
                            var blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
                            uploadAudio(blob);
                        };

                        mediaRecorder.start(1000);
                    } catch (e) {
                        stream.getTracks().forEach(function (track) { track.stop(); });
                        errorMsg = t.error;
                        state = 'error';
                        render();
                        return;
                    }

                    timerInterval = setInterval(function () {
                        seconds++;
                        if (seconds >= maxDuration) {
                            stopRecording();
                            return;
                        }
                        var timerEl = wrapper.querySelector('.gv-timer');
                        if (timerEl) timerEl.textContent = formatTime(seconds);
                    }, 1000);

                    render();
                })
                .catch(function (err) {
                    errorMsg = (err && err.name === 'NotFoundError')
                        ? t.notSupported
                        : t.permissionDenied;
                    state = 'error';
                    render();
                });
        }

        function stopRecording() {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                clearInterval(timerInterval);
                mediaRecorder.stop();
                state = 'uploading';
                render();
            }
        }

        // --- Upload ---
        var uploadStartedAt = 0;

        function uploadAudio(blob, attempt) {
            attempt = attempt || 1;
            if (attempt === 1) uploadStartedAt = Date.now();
            var ext = blob.type.indexOf('webm') !== -1 ? 'webm'
                : blob.type.indexOf('mp4') !== -1 ? 'mp4'
                : 'webm';

            var formData = new FormData();
            formData.append('audio', blob, 'recording.' + ext);
            formData.append('session_id', sessionId);
            if (questionId) formData.append('question_id', questionId);
            formData.append('duration_seconds', String(seconds));
            formData.append('language', lang);

            // Show "processing" message after 15s
            var longTimer = setTimeout(function () {
                if (state === 'uploading') render();
            }, 15000);

            // Abort fetch after 120s
            var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            var fetchTimeout = setTimeout(function () {
                if (controller) controller.abort();
            }, 120000);

            fetch(apiUrl + '/api/transcribe', {
                method: 'POST',
                headers: { 'x-project-key': projectKey },
                body: formData,
                signal: controller ? controller.signal : undefined
            })
            .then(function (response) {
                if (!response.ok) throw new Error('Server error: ' + response.status);
                return response.json();
            })
            .then(function (data) {
                clearTimeout(fetchTimeout);
                clearTimeout(longTimer);
                if (state !== 'uploading') return;
                if (data.success && data.status === 'completed') {
                    var transcription = data.transcription || '';
                    // Fill textarea with transcription (editable)
                    state = 'idle';
                    voiceJustFinished = true;
                    render();
                    if (textareaEl) {
                        textareaEl.value = transcription;
                        textareaEl.focus();
                    }
                    writeToFormField(transcription);
                } else {
                    errorMsg = data.error || t.error;
                    state = 'error';
                    render();
                }
            })
            .catch(function () {
                clearTimeout(longTimer);
                clearTimeout(fetchTimeout);
                if (state !== 'uploading') return;
                if (attempt < 2) {
                    setTimeout(function () { uploadAudio(blob, attempt + 1); }, 3000);
                    return;
                }
                errorMsg = t.error;
                state = 'error';
                render();
            });
        }

        function resetWidget() {
            clearInterval(timerInterval);
            if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                try { mediaRecorder.stop(); } catch (e) { /* ignore */ }
            }
            mediaRecorder = null;
            state = 'idle';
            errorMsg = '';
            seconds = 0;
            voiceJustFinished = false;
            textSaved = false;
            textSaving = false;
            lastSavedText = '';
            render();
            if (textareaEl) textareaEl.value = '';
            writeToFormField('');
        }

        // --- Fetch widget config (non-blocking) ---
        fetch(apiUrl + '/api/widget-config/' + projectKey)
            .then(function (r) { return r.json(); })
            .then(function (cfg) {
                configLoaded = true;
                if (cfg.max_duration) maxDuration = cfg.max_duration;
                if (cfg.show_branding) showBranding = true;
                if (cfg.theme) applyTheme(cfg.theme);
                render();
            })
            .catch(function () { /* use defaults on error */ });

        // --- Initialize widget ---
        render();
    }

    // --- Shared helpers (outside initWidget, no per-instance state) ---
    function getSessionFromUrl() {
        try {
            var params = new URLSearchParams(window.location.search);
            return params.get('sguid') || params.get('snc') || null;
        } catch (e) { return null; }
    }

    function generateFallbackId() {
        return 'gv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    function getScriptOrigin() {
        try {
            var scripts = document.getElementsByTagName('script');
            for (var i = 0; i < scripts.length; i++) {
                if (scripts[i].src && scripts[i].src.indexOf('voice.js') !== -1) {
                    var url = new URL(scripts[i].src);
                    return url.origin;
                }
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    function getMimeType() {
        if (typeof MediaRecorder === 'undefined') return '';
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
        if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
        if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
        return '';
    }

    function formatTime(s) {
        var m = Math.floor(s / 60);
        var sec = s % 60;
        return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
    }

    function el(tag, attrs) {
        var e = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach(function (k) {
                if (k === 'className') e.className = attrs[k];
                else if (k === 'classList') { /* skip, handled via className */ }
                else if (k === 'placeholder') e.placeholder = attrs[k];
                else if (k.indexOf('on') === 0) e.addEventListener(k.substring(2), attrs[k]);
                else e.setAttribute(k, attrs[k]);
            });
        }
        return e;
    }

    // --- SVG Icons ---
    function micSvg() {
        return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>';
    }

    function stopSvg() {
        return '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
    }

    function checkSvgSmall() {
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    }

    // --- Styles ---
    function getStyles() {
        return [
            ':host { display: block; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }',
            '.gv-widget { padding: 16px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; max-width: 400px; }',

            // Textarea
            '.gv-textarea { display: block; width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; font-family: inherit; line-height: 1.5; resize: vertical; min-height: 60px; color: #1e293b; background: #fff; transition: border-color 0.2s; }',
            '.gv-textarea:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }',
            '.gv-textarea::placeholder { color: #94a3b8; }',
            '.gv-textarea-disabled { background: #f8fafc; color: #64748b; cursor: not-allowed; }',

            // Status area
            '.gv-status { min-height: 24px; margin-top: 8px; }',

            // Actions row
            '.gv-actions { display: flex; gap: 8px; margin-top: 10px; justify-content: center; }',

            // Buttons
            '.gv-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s; line-height: 1; }',
            '.gv-btn:hover { transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.12); }',
            '.gv-btn:active { transform: translateY(0); }',
            '.gv-btn svg { flex-shrink: 0; }',

            // Mic/dictate button
            '.gv-btn-mic { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }',
            '.gv-btn-mic:hover { background: #e2e8f0; color: #334155; }',

            // Stop button
            '.gv-btn-stop { background: #ef4444; color: #fff; }',
            '.gv-btn-stop:hover { background: #dc2626; }',

            // Secondary button
            '.gv-btn-secondary { background: #f1f5f9; color: #334155; }',
            '.gv-btn-secondary:hover { background: #e2e8f0; }',

            // Recording indicator
            '.gv-recording-indicator { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 600; color: #ef4444; font-variant-numeric: tabular-nums; }',
            '.gv-pulse { display: inline-block; width: 10px; height: 10px; background: #ef4444; border-radius: 50%; animation: gv-pulse-anim 1s ease-in-out infinite; }',
            '@keyframes gv-pulse-anim { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.3); } }',

            // Uploading
            '.gv-uploading { display: flex; align-items: center; gap: 10px; color: #64748b; font-size: 14px; }',
            '.gv-spinner { width: 20px; height: 20px; border: 2px solid #e2e8f0; border-top-color: #6366f1; border-radius: 50%; animation: gv-spin 0.8s linear infinite; }',
            '@keyframes gv-spin { to { transform: rotate(360deg); } }',

            // Messages
            '.gv-msg { font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 4px; }',
            '.gv-success-msg { color: #16a34a; }',
            '.gv-editing-hint { color: #6366f1; font-weight: 400; font-style: italic; }',
            '.gv-error-msg { color: #dc2626; }',

            // Branding
            '.gv-branding { margin-top: 10px; text-align: center; font-size: 11px; }',
            '.gv-branding a { color: #94a3b8; text-decoration: none; }',
            '.gv-branding a:hover { color: #6366f1; text-decoration: underline; }'
        ].join('\n');
    }

    // --- Bootstrap: wait for DOM if needed, then scan all containers ---
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scanAndInit);
    } else {
        scanAndInit();
    }
})();
