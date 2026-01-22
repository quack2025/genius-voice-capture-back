const { supabaseClient } = require('../config/supabase');

/**
 * Middleware para validar JWT de Supabase
 */
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Missing authorization header'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const { data: { user }, error } = await supabaseClient.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired token'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({
            success: false,
            error: 'Authentication error'
        });
    }
}

module.exports = { requireAuth };
