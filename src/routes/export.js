const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');
const { exportQuerySchema, validate } = require('../validators/schemas');
const { recordingsToCSV } = require('../utils/csvParser');
const { supabaseAdmin } = require('../config/supabase');

const router = express.Router({ mergeParams: true });

/**
 * GET /api/projects/:projectId/export
 * Export recordings as CSV
 */
router.get('/',
    requireAuth,
    asyncHandler(async (req, res) => {
        const { projectId } = req.params;
        const userId = req.user.id;

        // Verify project ownership
        const { data: project } = await supabaseAdmin
            .from('projects')
            .select('id, name')
            .eq('id', projectId)
            .eq('user_id', userId)
            .single();

        if (!project) {
            throw new HttpError(404, 'Project not found');
        }

        // Validate query params
        const validation = validate(exportQuerySchema, req.query);
        if (!validation.success) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                details: validation.errors
            });
        }

        const { format, status } = validation.data;

        // Build query
        let query = supabaseAdmin
            .from('recordings')
            .select('session_id, question_id, transcription, duration_seconds, status, language_detected, created_at, transcribed_at')
            .eq('project_id', projectId)
            .order('created_at', { ascending: true });

        if (status === 'completed') {
            query = query.eq('status', 'completed');
        }

        const { data: recordings, error } = await query;

        if (error) {
            throw new Error(`Failed to fetch recordings: ${error.message}`);
        }

        if (recordings.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No recordings found for export'
            });
        }

        // Generate filename
        const timestamp = new Date().toISOString().split('T')[0];
        const sanitizedName = project.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
        const filename = `${sanitizedName}_${timestamp}`;

        if (format === 'csv') {
            const csv = recordingsToCSV(recordings);

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
            return res.send(csv);
        }

        // For xlsx format, we'd need to add xlsx library
        // For now, default to CSV
        if (format === 'xlsx') {
            // TODO: Implement xlsx export with exceljs or xlsx library
            return res.status(501).json({
                success: false,
                error: 'XLSX export not yet implemented. Please use CSV format.'
            });
        }

        res.status(400).json({
            success: false,
            error: 'Invalid format'
        });
    })
);

module.exports = router;
