const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { supabaseAdmin } = require('../config/supabase');
const { getPlan, getCurrentMonth, PLANS } = require('../config/plans');

const router = express.Router();

/**
 * GET /api/account/usage
 * Returns user's plan, usage, and limits for the dashboard.
 */
router.get('/usage',
    requireAuth,
    asyncHandler(async (req, res) => {
        const userId = req.user.id;

        // Fetch user plan + org membership
        const { data: profile } = await supabaseAdmin
            .from('user_profiles')
            .select('plan, plan_started_at, is_admin, org_id, org_role')
            .eq('id', userId)
            .single();

        const currentMonth = getCurrentMonth();
        let planKey, plan, orgInfo = null;

        if (profile?.org_id) {
            // User belongs to an org — use org's plan
            const [orgResult, orgUsageResult, memberCountResult] = await Promise.all([
                supabaseAdmin.from('organizations').select('id, name, plan, max_seats')
                    .eq('id', profile.org_id).single(),
                supabaseAdmin.from('org_usage').select('responses_count')
                    .eq('org_id', profile.org_id).eq('month', currentMonth).maybeSingle(),
                supabaseAdmin.from('user_profiles').select('id', { count: 'exact', head: true })
                    .eq('org_id', profile.org_id),
            ]);

            const org = orgResult.data;
            planKey = org?.plan || 'enterprise';
            plan = getPlan(planKey);

            orgInfo = {
                id: org?.id,
                name: org?.name,
                role: profile.org_role,
                plan: planKey,
                plan_name: plan.name,
                max_seats: org?.max_seats || 10,
                member_count: memberCountResult.count || 0,
                responses_this_month: orgUsageResult.data?.responses_count || 0,
                max_responses: plan.max_responses,
            };
        } else {
            planKey = profile?.plan || 'free';
            plan = getPlan(planKey);
        }

        // Fetch personal usage for current month
        const { data: usageRow } = await supabaseAdmin
            .from('usage')
            .select('responses_count')
            .eq('user_id', userId)
            .eq('month', currentMonth)
            .maybeSingle();

        // Project count
        const { count: projectCount } = await supabaseAdmin
            .from('projects')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        // Per-project usage for this month (completed recordings)
        const { data: projects } = await supabaseAdmin
            .from('projects')
            .select('id, name')
            .eq('user_id', userId);

        const perProject = {};
        if (projects && projects.length > 0) {
            const projectIds = projects.map(p => p.id);
            const monthStart = `${currentMonth}-01T00:00:00.000Z`;

            const { data: recordings } = await supabaseAdmin
                .from('recordings')
                .select('project_id')
                .in('project_id', projectIds)
                .gte('created_at', monthStart)
                .eq('status', 'completed');

            if (recordings) {
                for (const rec of recordings) {
                    perProject[rec.project_id] = (perProject[rec.project_id] || 0) + 1;
                }
            }
        }

        const response = {
            is_admin: profile?.is_admin || false,
            plan: planKey,
            plan_name: plan.name,
            plan_started_at: profile?.plan_started_at,
            limits: {
                max_responses: orgInfo ? orgInfo.max_responses : plan.max_responses,
                max_projects: plan.max_projects,
                max_duration: plan.max_duration,
                languages: plan.languages,
                export_formats: plan.export_formats,
                batch: plan.batch,
                custom_themes: plan.custom_themes,
                custom_domains: plan.custom_domains,
                show_branding: plan.show_branding
            },
            usage: {
                responses_this_month: orgInfo
                    ? orgInfo.responses_this_month
                    : (usageRow?.responses_count || 0),
                personal_responses_this_month: usageRow?.responses_count || 0,
                projects_count: projectCount || 0,
                per_project: perProject
            },
            month: currentMonth
        };

        if (orgInfo) {
            response.org = orgInfo;
        }

        res.json(response);
    })
);

/**
 * GET /api/account/plans
 * Returns all available plans for comparison display.
 */
router.get('/plans',
    asyncHandler(async (req, res) => {
        const planList = Object.entries(PLANS).map(([key, plan]) => ({
            key,
            ...plan
        }));
        res.json({ plans: planList });
    })
);

module.exports = router;
