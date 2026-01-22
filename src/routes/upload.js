const express = require('express');
const multer = require('multer');
const { validateProjectKey } = require('../middleware/projectKey');
const { asyncHandler } = require('../middleware/errorHandler');
const { uploadSchema, validate } = require('../validators/schemas');
const { uploadAudio, validateAudioFile } = require('../services/storage');
const { enqueueTranscription } = require('../services/transcriptionQueue');
const { supabaseAdmin } = require('../config/supabase');
const config = require('../config');

const router = express.Router();

// Configure multer for file upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: config.maxAudioSizeMB * 1024 * 1024
    }
});

/**
 * POST /api/upload
 * Receive audio from widget embedded in Alchemer
 */
router.post('/',
    validateProjectKey,
    upload.single('audio'),
    asyncHandler(async (req, res) => {
        // Validate audio file
        const fileValidation = validateAudioFile(req.file);
        if (!fileValidation.valid) {
            return res.status(400).json({
                success: false,
                error: fileValidation.error
            });
        }

        // Validate request body
        const bodyValidation = validate(uploadSchema, req.body);
        if (!bodyValidation.success) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                details: bodyValidation.errors
            });
        }

        const { session_id, question_id, duration_seconds, metadata } = bodyValidation.data;
        const project = req.project;

        // Validate duration if provided
        if (duration_seconds && duration_seconds > config.maxAudioDurationSeconds) {
            return res.status(400).json({
                success: false,
                error: `Audio too long. Maximum duration: ${config.maxAudioDurationSeconds} seconds`
            });
        }

        // Upload audio to storage
        const { path: audioPath, size: audioSize } = await uploadAudio(
            req.file.buffer,
            project.id,
            session_id,
            req.file.mimetype
        );

        // Create recording in database
        const { data: recording, error: dbError } = await supabaseAdmin
            .from('recordings')
            .insert({
                project_id: project.id,
                session_id,
                question_id: question_id || null,
                audio_path: audioPath,
                audio_size_bytes: audioSize,
                duration_seconds: duration_seconds || null,
                metadata: metadata || {},
                status: 'pending'
            })
            .select('id')
            .single();

        if (dbError) {
            throw new Error(`Failed to create recording: ${dbError.message}`);
        }

        // If realtime mode, enqueue transcription immediately
        if (project.transcription_mode === 'realtime') {
            await supabaseAdmin
                .from('recordings')
                .update({ status: 'processing' })
                .eq('id', recording.id);

            enqueueTranscription(recording.id);

            return res.status(200).json({
                success: true,
                recording_id: recording.id,
                status: 'processing'
            });
        }

        // Batch mode - leave as pending
        return res.status(200).json({
            success: true,
            recording_id: recording.id,
            status: 'pending'
        });
    })
);

module.exports = router;
