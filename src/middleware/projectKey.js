const { supabaseAdmin } = require('../config/supabase');

/**
 * Middleware para validar project key (usado por widget)
 * Usa service role para bypass de RLS
 */
async function validateProjectKey(req, res, next) {
    const projectKey = req.headers['x-project-key'];

    if (!projectKey) {
        return res.status(401).json({
            success: false,
            error: 'Missing x-project-key header'
        });
    }

    try {
        const { data: project, error } = await supabaseAdmin
            .from('projects')
            .select('id, transcription_mode, language, user_id')
            .eq('public_key', projectKey)
            .single();

        if (error || !project) {
            return res.status(401).json({
                success: false,
                error: 'Invalid project key'
            });
        }

        req.project = project;
        next();
    } catch (error) {
        console.error('Project key validation error:', error);
        return res.status(500).json({
            success: false,
            error: 'Project validation error'
        });
    }
}

module.exports = { validateProjectKey };
