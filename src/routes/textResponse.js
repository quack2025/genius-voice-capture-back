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
 *
 * UPSERT logic: one recording per (project_id, session_id, question_id, input_method='text').
 * - If text is non-empty and no existing record: INSERT (increments usage).
 * - If text is non-empty and existing record: UPDATE transcription only.
 * - If text is empty and existing record: DELETE it (respondent cleared their answer).
 * - If text is empty and no existing record: no-op.
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
        const qid = question_id || null;

        // Find existing text recording for this (project, session, question)
        let existingQuery = supabaseAdmin
            .from('recordings')
            .select('id')
            .eq('project_id', project.id)
            .eq('session_id', session_id)
            .eq('input_method', 'text');

        if (qid) {
            existingQuery = existingQuery.eq('question_id', qid);
        } else {
            existingQuery = existingQuery.is('question_id', null);
        }

        const { data: existing } = await existingQuery.maybeSingle();

        // --- Empty text = clear the response ---
        if (!text || !text.trim()) {
            if (existing) {
                await supabaseAdmin
                    .from('recordings')
                    .delete()
                    .eq('id', existing.id);
            }
            return res.status(200).json({
                success: true,
                action: 'cleared',
                status: 'cleared'
            });
        }

        const trimmedText = text.trim();

        // --- Existing record: UPDATE ---
        if (existing) {
            const { data: recording, error: dbError } = await supabaseAdmin
                .from('recordings')
                .update({
                    transcription: trimmedText,
                    language_detected: language || project.language || null,
                    metadata: metadata || {},
                    transcribed_at: new Date().toISOString()
                })
                .eq('id', existing.id)
                .select('id')
                .single();

            if (dbError) {
                throw new Error(`Failed to update recording: ${dbError.message}`);
            }

            return res.status(200).json({
                success: true,
                recording_id: recording.id,
                status: 'completed',
                action: 'updated'
            });
        }

        // --- No existing record: INSERT ---
        const { data: recording, error: dbError } = await supabaseAdmin
            .from('recordings')
            .insert({
                project_id: project.id,
                session_id,
                question_id: qid,
                audio_path: 'text-input',
                audio_size_bytes: 0,
                duration_seconds: 0,
                transcription: trimmedText,
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

        // Increment monthly usage counter only on INSERT (not on UPDATE)
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
            status: 'completed',
            action: 'created'
        });
    })
);

module.exports = router;
