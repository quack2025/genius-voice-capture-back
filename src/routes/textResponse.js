const express = require('express');
const { validateProjectKey } = require('../middleware/projectKey');
const { asyncHandler } = require('../middleware/errorHandler');
const { textResponseSchema, validate } = require('../validators/schemas');
const { supabaseAdmin } = require('../config/supabase');

const router = express.Router();

/**
 * POST /api/text-response
 * Save a typed text response (no audio, no Whisper).
 * Used by the widget when the respondent types instead of speaking.
 */
router.post('/',
    validateProjectKey,
    asyncHandler(async (req, res) => {
        const bodyValidation = validate(textResponseSchema, req.body);
        if (!bodyValidation.success) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                details: bodyValidation.errors
            });
        }

        const { session_id, question_id, text, language, metadata } = bodyValidation.data;
        const project = req.project;

        const { data: recording, error: dbError } = await supabaseAdmin
            .from('recordings')
            .insert({
                project_id: project.id,
                session_id,
                question_id: question_id || null,
                audio_path: 'text-input',
                audio_size_bytes: 0,
                duration_seconds: 0,
                transcription: text,
                language_detected: language || project.language || null,
                input_method: 'text',
                metadata: metadata || {},
                status: 'completed',
                transcribed_at: new Date().toISOString()
            })
            .select('id')
            .single();

        if (dbError) {
            throw new Error(`Failed to create recording: ${dbError.message}`);
        }

        // Increment monthly usage counter
        if (req.usage) {
            await supabaseAdmin
                .from('usage')
                .upsert({
                    user_id: req.usage.userId,
                    month: req.usage.month,
                    responses_count: req.usage.current + 1
                }, { onConflict: 'user_id,month' });
        }

        return res.status(200).json({
            success: true,
            recording_id: recording.id,
            status: 'completed'
        });
    })
);

module.exports = router;
