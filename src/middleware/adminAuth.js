const { requireAuth } = require('./auth');
const { supabaseAdmin } = require('../config/supabase');

/**
 * Middleware: requireAuth + verify is_admin = true on user_profiles.
 * Composes requireAuth (no duplicated JWT logic) then checks admin flag.
 */
async function requireAdmin(req, res, next) {
    // First run requireAuth to populate req.user
    requireAuth(req, res, async () => {
        try {
            const { data: profile, error } = await supabaseAdmin
                .from('user_profiles')
                .select('is_admin')
                .eq('id', req.user.id)
                .single();

            if (error || !profile || !profile.is_admin) {
                return res.status(403).json({
                    success: false,
                    error: 'Admin access required'
                });
            }

            next();
        } catch (error) {
            console.error('Admin auth middleware error:', error);
            return res.status(500).json({
                success: false,
                error: 'Authorization error'
            });
        }
    });
}

module.exports = { requireAdmin };
