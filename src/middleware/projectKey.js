const { supabaseAdmin } = require('../config/supabase');
const { getPlan, getCurrentMonth } = require('../config/plans');
const { getRequestOrigin, isDomainAllowed } = require('../utils/domainValidation');

/**
 * Middleware para validar project key (usado por widget).
 * Also fetches user plan + usage and enforces monthly quota.
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
            .select('id, transcription_mode, language, user_id, settings')
            .eq('public_key', projectKey)
            .single();

        if (error || !project) {
            return res.status(401).json({
                success: false,
                error: 'Invalid project key'
            });
        }

        // Fetch user plan + org membership
        const { data: profile } = await supabaseAdmin
            .from('user_profiles')
            .select('plan, org_id')
            .eq('id', project.user_id)
            .single();

        let planKey, plan, currentUsage, orgId = null;
        const currentMonth = getCurrentMonth();

        let personalCurrent = 0;

        if (profile?.org_id) {
            // User belongs to an org — use org's plan and org_usage for quota
            orgId = profile.org_id;
            const [orgResult, orgUsageResult, personalUsageResult] = await Promise.all([
                supabaseAdmin.from('organizations').select('plan').eq('id', orgId).single(),
                supabaseAdmin.from('org_usage').select('responses_count')
                    .eq('org_id', orgId).eq('month', currentMonth).maybeSingle(),
                supabaseAdmin.from('usage').select('responses_count')
                    .eq('user_id', project.user_id).eq('month', currentMonth).maybeSingle(),
            ]);

            planKey = orgResult.data?.plan || 'enterprise';
            plan = getPlan(planKey);
            currentUsage = orgUsageResult.data?.responses_count || 0;
            personalCurrent = personalUsageResult.data?.responses_count || 0;
        } else {
            // Individual user — existing behavior
            planKey = profile?.plan || 'free';
            plan = getPlan(planKey);

            const { data: usageRow } = await supabaseAdmin
                .from('usage')
                .select('responses_count')
                .eq('user_id', project.user_id)
                .eq('month', currentMonth)
                .maybeSingle();

            currentUsage = usageRow?.responses_count || 0;
        }

        // Enforce monthly quota
        if (currentUsage >= plan.max_responses) {
            return res.status(429).json({
                success: false,
                error: 'Monthly response limit reached. Please upgrade your plan.',
                limit: plan.max_responses,
                current: currentUsage,
                plan: planKey
            });
        }

        // --- Domain locking: validate Origin against project's allowed_domains ---
        const allowedDomains = project.settings?.allowed_domains;
        if (allowedDomains && Array.isArray(allowedDomains) && allowedDomains.length > 0) {
            const origin = getRequestOrigin(req);
            if (!isDomainAllowed(origin, allowedDomains)) {
                console.warn(`[DomainLock] Blocked ${origin || '(no origin)'} for project ${project.id}. Allowed: ${allowedDomains.join(', ')}`);
                return res.status(403).json({
                    success: false,
                    error: 'Domain not authorized for this project'
                });
            }
        }

        req.project = project;
        req.plan = plan;
        req.planKey = planKey;
        req.usage = { current: currentUsage, personalCurrent, month: currentMonth, userId: project.user_id, orgId };
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
