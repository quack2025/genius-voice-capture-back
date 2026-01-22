const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');
const { batchTranscribeSchema, validate } = require('../validators/schemas');
const { calculateTranscriptionCost } = require('../services/whisper');
const { startBatchProcessing } = require('../services/transcriptionQueue');
const { supabaseAdmin } = require('../config/supabase');

const router = express.Router({ mergeParams: true });

/**
 * POST /api/projects/:projectId/transcribe-batch
 * Prepare batch transcription (does NOT execute yet)
 */
router.post('/',
    requireAuth,
    asyncHandler(async (req, res) => {
        const { projectId } = req.params;
        const userId = req.user.id;

        // Verify project ownership
        const { data: project } = await supabaseAdmin
            .from('projects')
            .select('id')
            .eq('id', projectId)
            .eq('user_id', userId)
            .single();

        if (!project) {
            throw new HttpError(404, 'Project not found');
        }

        // Validate request body
        const validation = validate(batchTranscribeSchema, req.body);
        if (!validation.success) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                details: validation.errors
            });
        }

        const { session_ids } = validation.data;

        // Find recordings matching session_ids
        const { data: recordings, error: fetchError } = await supabaseAdmin
            .from('recordings')
            .select('id, session_id, status, duration_seconds')
            .eq('project_id', projectId)
            .in('session_id', session_ids);

        if (fetchError) {
            throw new Error(`Failed to fetch recordings: ${fetchError.message}`);
        }

        // Categorize recordings
        const foundSessionIds = new Set(recordings.map(r => r.session_id));
        const notFoundSessionIds = session_ids.filter(id => !foundSessionIds.has(id));
        const alreadyTranscribed = recordings.filter(r => r.status === 'completed');
        const toTranscribe = recordings.filter(r => r.status !== 'completed');

        // Calculate estimated cost
        const totalDuration = toTranscribe.reduce(
            (sum, r) => sum + (r.duration_seconds || 60), // Assume 60s if unknown
            0
        );
        const estimatedCost = calculateTranscriptionCost(totalDuration);

        // Create batch record
        const { data: batch, error: batchError } = await supabaseAdmin
            .from('transcription_batches')
            .insert({
                project_id: projectId,
                user_id: userId,
                status: 'pending_confirmation',
                total_recordings: toTranscribe.length,
                estimated_cost_usd: estimatedCost,
                session_ids_requested: session_ids,
                session_ids_not_found: notFoundSessionIds
            })
            .select()
            .single();

        if (batchError) {
            throw new Error(`Failed to create batch: ${batchError.message}`);
        }

        res.json({
            success: true,
            batch_id: batch.id,
            summary: {
                requested: session_ids.length,
                found: foundSessionIds.size,
                not_found: notFoundSessionIds.length,
                already_transcribed: alreadyTranscribed.length,
                to_transcribe: toTranscribe.length
            },
            not_found_session_ids: notFoundSessionIds,
            estimated_duration_minutes: Math.ceil(totalDuration / 60),
            estimated_cost_usd: estimatedCost,
            status: 'pending_confirmation'
        });
    })
);

/**
 * GET /api/projects/:projectId/transcribe-batch/:batchId
 * Get batch status
 */
router.get('/:batchId',
    requireAuth,
    asyncHandler(async (req, res) => {
        const { projectId, batchId } = req.params;
        const userId = req.user.id;

        // Verify project ownership
        const { data: project } = await supabaseAdmin
            .from('projects')
            .select('id')
            .eq('id', projectId)
            .eq('user_id', userId)
            .single();

        if (!project) {
            throw new HttpError(404, 'Project not found');
        }

        // Get batch
        const { data: batch, error } = await supabaseAdmin
            .from('transcription_batches')
            .select('*')
            .eq('id', batchId)
            .eq('project_id', projectId)
            .single();

        if (error || !batch) {
            throw new HttpError(404, 'Batch not found');
        }

        // Get current progress from recordings
        const { data: recordings } = await supabaseAdmin
            .from('recordings')
            .select('id, session_id, status, error_message')
            .eq('batch_id', batchId);

        const completed = recordings?.filter(r => r.status === 'completed').length || 0;
        const failed = recordings?.filter(r => r.status === 'failed').length || 0;
        const pending = recordings?.filter(r => r.status === 'pending' || r.status === 'processing').length || 0;

        const failedRecordings = recordings
            ?.filter(r => r.status === 'failed')
            .map(r => ({
                id: r.id,
                session_id: r.session_id,
                error: r.error_message
            })) || [];

        // Calculate estimated completion time (rough estimate: 2 seconds per recording)
        let estimatedCompletion = null;
        if (batch.status === 'processing' && pending > 0) {
            const estimatedSeconds = pending * 2;
            estimatedCompletion = new Date(Date.now() + estimatedSeconds * 1000).toISOString();
        }

        res.json({
            batch_id: batch.id,
            status: batch.status,
            progress: {
                total: batch.total_recordings,
                completed,
                failed,
                pending
            },
            failed_recordings: failedRecordings,
            estimated_cost_usd: batch.estimated_cost_usd,
            actual_cost_usd: batch.actual_cost_usd,
            started_at: batch.confirmed_at,
            estimated_completion: estimatedCompletion,
            completed_at: batch.completed_at
        });
    })
);

/**
 * POST /api/projects/:projectId/transcribe-batch/:batchId/confirm
 * Confirm and execute batch transcription
 */
router.post('/:batchId/confirm',
    requireAuth,
    asyncHandler(async (req, res) => {
        const { projectId, batchId } = req.params;
        const userId = req.user.id;

        // Verify project ownership
        const { data: project } = await supabaseAdmin
            .from('projects')
            .select('id')
            .eq('id', projectId)
            .eq('user_id', userId)
            .single();

        if (!project) {
            throw new HttpError(404, 'Project not found');
        }

        // Get batch and verify status
        const { data: batch, error: batchError } = await supabaseAdmin
            .from('transcription_batches')
            .select('*')
            .eq('id', batchId)
            .eq('project_id', projectId)
            .eq('user_id', userId)
            .single();

        if (batchError || !batch) {
            throw new HttpError(404, 'Batch not found');
        }

        if (batch.status !== 'pending_confirmation') {
            throw new HttpError(400, `Batch cannot be confirmed. Current status: ${batch.status}`);
        }

        // Get recordings to process
        const requestedSessionIds = batch.session_ids_requested || [];
        const notFoundIds = new Set(batch.session_ids_not_found || []);
        const validSessionIds = requestedSessionIds.filter(id => !notFoundIds.has(id));

        const { data: recordings, error: recError } = await supabaseAdmin
            .from('recordings')
            .select('id, status')
            .eq('project_id', projectId)
            .in('session_id', validSessionIds)
            .neq('status', 'completed');

        if (recError) {
            throw new Error(`Failed to fetch recordings: ${recError.message}`);
        }

        // Update recordings to processing and assign batch_id
        const recordingIds = recordings.map(r => r.id);

        if (recordingIds.length > 0) {
            await supabaseAdmin
                .from('recordings')
                .update({
                    status: 'processing',
                    batch_id: batchId
                })
                .in('id', recordingIds);
        }

        // Update batch status
        await supabaseAdmin
            .from('transcription_batches')
            .update({
                status: 'processing',
                confirmed_at: new Date().toISOString(),
                total_recordings: recordingIds.length
            })
            .eq('id', batchId);

        // Start batch processing
        startBatchProcessing(batchId);

        // Estimate completion time (rough: 2 seconds per recording)
        const estimatedSeconds = recordingIds.length * 2;
        const estimatedCompletion = new Date(Date.now() + estimatedSeconds * 1000).toISOString();

        res.json({
            success: true,
            batch_id: batchId,
            status: 'processing',
            recordings_queued: recordingIds.length,
            estimated_completion: estimatedCompletion
        });
    })
);

/**
 * POST /api/projects/:projectId/transcribe-batch/:batchId/cancel
 * Cancel a pending batch
 */
router.post('/:batchId/cancel',
    requireAuth,
    asyncHandler(async (req, res) => {
        const { projectId, batchId } = req.params;
        const userId = req.user.id;

        // Verify project ownership
        const { data: project } = await supabaseAdmin
            .from('projects')
            .select('id')
            .eq('id', projectId)
            .eq('user_id', userId)
            .single();

        if (!project) {
            throw new HttpError(404, 'Project not found');
        }

        // Get batch
        const { data: batch, error } = await supabaseAdmin
            .from('transcription_batches')
            .select('status')
            .eq('id', batchId)
            .eq('project_id', projectId)
            .single();

        if (error || !batch) {
            throw new HttpError(404, 'Batch not found');
        }

        if (batch.status !== 'pending_confirmation') {
            throw new HttpError(400, 'Only pending batches can be cancelled');
        }

        // Update batch status
        await supabaseAdmin
            .from('transcription_batches')
            .update({ status: 'cancelled' })
            .eq('id', batchId);

        res.json({
            success: true,
            batch_id: batchId,
            status: 'cancelled'
        });
    })
);

module.exports = router;
