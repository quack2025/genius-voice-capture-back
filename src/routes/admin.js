const express = require('express');
const { requireAdmin } = require('../middleware/adminAuth');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');
const { supabaseAdmin } = require('../config/supabase');
const { PLANS, getPlan, getCurrentMonth } = require('../config/plans');

const router = express.Router();

// All routes require admin
router.use(requireAdmin);

/**
 * GET /api/admin/stats
 * Platform-level aggregates for the admin dashboard.
 */
router.get('/stats',
    asyncHandler(async (req, res) => {
        const currentMonth = getCurrentMonth();
        const monthStart = `${currentMonth}-01T00:00:00.000Z`;

        const [usersResult, projectsResult, recordingsResult, recordingsMonthResult, planDistResult] =
            await Promise.all([
                supabaseAdmin.from('user_profiles').select('*', { count: 'exact', head: true }),
                supabaseAdmin.from('projects').select('*', { count: 'exact', head: true }),
                supabaseAdmin.from('recordings').select('*', { count: 'exact', head: true }),
                supabaseAdmin.from('recordings').select('*', { count: 'exact', head: true })
                    .gte('created_at', monthStart),
                supabaseAdmin.from('user_profiles').select('plan'),
            ]);

        // Count users by plan
        const usersByPlan = {};
        if (planDistResult.data) {
            for (const row of planDistResult.data) {
                const p = row.plan || 'free';
                usersByPlan[p] = (usersByPlan[p] || 0) + 1;
            }
        }

        res.json({
            success: true,
            total_users: usersResult.count || 0,
            total_projects: projectsResult.count || 0,
            total_recordings: recordingsResult.count || 0,
            recordings_this_month: recordingsMonthResult.count || 0,
            users_by_plan: usersByPlan,
            month: currentMonth
        });
    })
);

/**
 * GET /api/admin/users
 * Paginated user list with email, plan, usage, project count.
 * Query: ?page=1&limit=20&search=email
 */
router.get('/users',
    asyncHandler(async (req, res) => {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const search = (req.query.search || '').trim().toLowerCase();
        const offset = (page - 1) * limit;

        // Get all auth users for email lookup
        const { data: { users: authUsers }, error: authError } =
            await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });

        if (authError) {
            throw new Error(`Failed to list users: ${authError.message}`);
        }

        // Build email lookup
        const emailMap = {};
        for (const u of authUsers) {
            emailMap[u.id] = u.email;
        }

        // Get profiles
        const { data: profiles, error: profileError } = await supabaseAdmin
            .from('user_profiles')
            .select('id, plan, plan_started_at, is_admin, created_at, updated_at')
            .order('created_at', { ascending: false });

        if (profileError) {
            throw new Error(`Failed to fetch profiles: ${profileError.message}`);
        }

        // Enrich with email and apply search filter
        let enriched = profiles.map(p => ({
            ...p,
            email: emailMap[p.id] || 'unknown'
        }));

        if (search) {
            enriched = enriched.filter(u =>
                u.email.toLowerCase().includes(search) ||
                (u.plan || '').toLowerCase().includes(search)
            );
        }

        const total = enriched.length;
        const paginated = enriched.slice(offset, offset + limit);

        // Get project counts + usage for this page of users
        const userIds = paginated.map(u => u.id);

        if (userIds.length === 0) {
            return res.json({
                success: true,
                users: [],
                pagination: { page, limit, total, total_pages: 0 }
            });
        }

        const currentMonth = getCurrentMonth();

        const [projectsResult, usageResult] = await Promise.all([
            supabaseAdmin.from('projects').select('user_id').in('user_id', userIds),
            supabaseAdmin.from('usage').select('user_id, responses_count')
                .in('user_id', userIds).eq('month', currentMonth),
        ]);

        // Aggregate counts
        const projectCounts = {};
        if (projectsResult.data) {
            for (const row of projectsResult.data) {
                projectCounts[row.user_id] = (projectCounts[row.user_id] || 0) + 1;
            }
        }
        const usageMap = {};
        if (usageResult.data) {
            for (const row of usageResult.data) {
                usageMap[row.user_id] = row.responses_count;
            }
        }

        const users = paginated.map(u => ({
            ...u,
            projects_count: projectCounts[u.id] || 0,
            responses_this_month: usageMap[u.id] || 0,
            plan_name: getPlan(u.plan || 'free').name
        }));

        res.json({
            success: true,
            users,
            pagination: {
                page,
                limit,
                total,
                total_pages: Math.ceil(total / limit)
            }
        });
    })
);

/**
 * GET /api/admin/users/:userId
 * User detail: profile + projects + usage history.
 */
router.get('/users/:userId',
    asyncHandler(async (req, res) => {
        const { userId } = req.params;

        // Get auth user for email
        const { data: { user: authUser }, error: authError } =
            await supabaseAdmin.auth.admin.getUserById(userId);

        if (authError || !authUser) {
            throw new HttpError(404, 'User not found');
        }

        // Get profile
        const { data: profile } = await supabaseAdmin
            .from('user_profiles')
            .select('*')
            .eq('id', userId)
            .single();

        // Get projects
        const { data: projects } = await supabaseAdmin
            .from('projects')
            .select('id, name, language, transcription_mode, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        // Get usage history (all months)
        const { data: usageHistory } = await supabaseAdmin
            .from('usage')
            .select('month, responses_count')
            .eq('user_id', userId)
            .order('month', { ascending: false });

        res.json({
            success: true,
            user: {
                id: userId,
                email: authUser.email,
                plan: profile?.plan || 'free',
                plan_name: getPlan(profile?.plan || 'free').name,
                plan_started_at: profile?.plan_started_at,
                is_admin: profile?.is_admin || false,
                created_at: profile?.created_at || authUser.created_at
            },
            projects: projects || [],
            usage_history: usageHistory || []
        });
    })
);

/**
 * PUT /api/admin/users/:userId/plan
 * Change a user's plan.
 * Body: { plan: "free" | "freelancer" | "pro" | "enterprise" }
 */
router.put('/users/:userId/plan',
    asyncHandler(async (req, res) => {
        const { userId } = req.params;
        const { plan } = req.body;

        // Validate plan key
        if (!plan || !PLANS[plan]) {
            return res.status(400).json({
                success: false,
                error: `Invalid plan. Must be one of: ${Object.keys(PLANS).join(', ')}`
            });
        }

        // Verify user exists
        const { data: profile, error } = await supabaseAdmin
            .from('user_profiles')
            .select('id, plan')
            .eq('id', userId)
            .single();

        if (error || !profile) {
            throw new HttpError(404, 'User not found');
        }

        const previousPlan = profile.plan;

        // Update plan
        const { data: updated, error: updateError } = await supabaseAdmin
            .from('user_profiles')
            .update({
                plan,
                plan_started_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', userId)
            .select()
            .single();

        if (updateError) {
            throw new Error(`Failed to update plan: ${updateError.message}`);
        }

        console.log(`[Admin] Plan changed for user ${userId}: ${previousPlan} → ${plan}`);

        res.json({
            success: true,
            user: {
                id: updated.id,
                plan: updated.plan,
                plan_name: getPlan(updated.plan).name,
                plan_started_at: updated.plan_started_at
            },
            previous_plan: previousPlan
        });
    })
);

module.exports = router;
