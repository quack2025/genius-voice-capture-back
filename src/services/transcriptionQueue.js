const { supabaseAdmin } = require('../config/supabase');
const { transcribeAudio, calculateTranscriptionCost } = require('./whisper');

/**
 * Process a single recording transcription
 * @param {string} recordingId - Recording UUID
 * @returns {Promise<{success: boolean, transcription?: string, error?: string}>}
 */
async function processRecording(recordingId) {
    try {
        // Get recording details
        const { data: recording, error: fetchError } = await supabaseAdmin
            .from('recordings')
            .select('id, audio_path, project_id, projects(language)')
            .eq('id', recordingId)
            .single();

        if (fetchError || !recording) {
            throw new Error(`Recording not found: ${recordingId}`);
        }

        // Update status to processing
        await supabaseAdmin
            .from('recordings')
            .update({ status: 'processing' })
            .eq('id', recordingId);

        // Transcribe
        const language = recording.projects?.language || 'es';
        const result = await transcribeAudio(recording.audio_path, language);

        // Update with transcription
        await supabaseAdmin
            .from('recordings')
            .update({
                status: 'completed',
                transcription: result.text,
                language_detected: result.language,
                duration_seconds: Math.round(result.duration),
                transcribed_at: new Date().toISOString()
            })
            .eq('id', recordingId);

        return { success: true, transcription: result.text };
    } catch (error) {
        // Update with error
        await supabaseAdmin
            .from('recordings')
            .update({
                status: 'failed',
                error_message: error.message
            })
            .eq('id', recordingId);

        return { success: false, error: error.message };
    }
}

/**
 * Process batch transcription
 * @param {string} batchId - Batch UUID
 * @returns {Promise<void>}
 */
async function processBatch(batchId) {
    try {
        // Get all recordings for this batch
        const { data: recordings, error: fetchError } = await supabaseAdmin
            .from('recordings')
            .select('id')
            .eq('batch_id', batchId)
            .eq('status', 'processing');

        if (fetchError) {
            throw new Error(`Failed to fetch batch recordings: ${fetchError.message}`);
        }

        let completedCount = 0;
        let failedCount = 0;
        let actualCost = 0;

        // Process each recording
        for (const recording of recordings) {
            const result = await processRecording(recording.id);

            if (result.success) {
                completedCount++;
            } else {
                failedCount++;
            }

            // Update batch progress
            await supabaseAdmin
                .from('transcription_batches')
                .update({
                    completed_count: completedCount,
                    failed_count: failedCount
                })
                .eq('id', batchId);
        }

        // Calculate actual cost from completed recordings
        const { data: completedRecordings } = await supabaseAdmin
            .from('recordings')
            .select('duration_seconds')
            .eq('batch_id', batchId)
            .eq('status', 'completed');

        if (completedRecordings) {
            const totalDuration = completedRecordings.reduce(
                (sum, r) => sum + (r.duration_seconds || 0),
                0
            );
            actualCost = calculateTranscriptionCost(totalDuration);
        }

        // Mark batch as completed
        const finalStatus = failedCount > 0 && completedCount > 0 ? 'partial' :
                           failedCount === recordings.length ? 'failed' : 'completed';

        await supabaseAdmin
            .from('transcription_batches')
            .update({
                status: finalStatus,
                actual_cost_usd: actualCost,
                completed_at: new Date().toISOString()
            })
            .eq('id', batchId);
    } catch (error) {
        console.error('Batch processing error:', error);

        await supabaseAdmin
            .from('transcription_batches')
            .update({ status: 'failed' })
            .eq('id', batchId);
    }
}

/**
 * Enqueue recording for transcription (immediate processing for MVP)
 * @param {string} recordingId - Recording UUID
 * @returns {Promise<void>}
 */
async function enqueueTranscription(recordingId) {
    // For MVP: process synchronously
    // TODO: Replace with proper queue (Bull, pg_notify, etc.) for scalability
    setImmediate(() => {
        processRecording(recordingId).catch(err => {
            console.error(`Failed to process recording ${recordingId}:`, err);
        });
    });
}

/**
 * Start batch processing (async)
 * @param {string} batchId - Batch UUID
 * @returns {Promise<void>}
 */
async function startBatchProcessing(batchId) {
    // For MVP: process in background
    // TODO: Replace with proper queue for scalability
    setImmediate(() => {
        processBatch(batchId).catch(err => {
            console.error(`Failed to process batch ${batchId}:`, err);
        });
    });
}

module.exports = {
    processRecording,
    processBatch,
    enqueueTranscription,
    startBatchProcessing
};
