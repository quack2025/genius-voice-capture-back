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

/**
 * GET /api/admin/orgs
 * List all organizations with member count and usage.
 */
router.get('/orgs',
    asyncHandler(async (req, res) => {
        const currentMonth = getCurrentMonth();

        const { data: orgs, error } = await supabaseAdmin
            .from('organizations')
            .select('id, name, plan, max_seats, owner_id, created_at')
            .order('created_at', { ascending: false });

        if (error) {
            throw new Error(`Failed to fetch organizations: ${error.message}`);
        }

        if (!orgs || orgs.length === 0) {
            return res.json({ success: true, orgs: [] });
        }

        // Get member counts + owner emails + usage
        const orgIds = orgs.map(o => o.id);
        const ownerIds = orgs.map(o => o.owner_id);

        const [membersResult, usageResult, authResult] = await Promise.all([
            supabaseAdmin.from('user_profiles').select('org_id').in('org_id', orgIds),
            supabaseAdmin.from('org_usage').select('org_id, responses_count')
                .in('org_id', orgIds).eq('month', currentMonth),
            supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        ]);

        const memberCounts = {};
        if (membersResult.data) {
            for (const row of membersResult.data) {
                memberCounts[row.org_id] = (memberCounts[row.org_id] || 0) + 1;
            }
        }

        const usageMap = {};
        if (usageResult.data) {
            for (const row of usageResult.data) {
                usageMap[row.org_id] = row.responses_count;
            }
        }

        const emailMap = {};
        if (authResult.data?.users) {
            for (const u of authResult.data.users) {
                emailMap[u.id] = u.email;
            }
        }

        const enriched = orgs.map(o => ({
            ...o,
            plan_name: getPlan(o.plan).name,
            max_responses: getPlan(o.plan).max_responses,
            owner_email: emailMap[o.owner_id] || 'unknown',
            member_count: memberCounts[o.id] || 0,
            responses_this_month: usageMap[o.id] || 0,
        }));

        res.json({ success: true, orgs: enriched });
    })
);

/**
 * POST /api/admin/orgs
 * Create a new organization.
 * Body: { name, ownerEmail, plan?, maxSeats? }
 */
router.post('/orgs',
    asyncHandler(async (req, res) => {
        const { name, ownerEmail, plan = 'enterprise', maxSeats = 10 } = req.body;

        if (!name || !ownerEmail) {
            return res.status(400).json({
                success: false,
                error: 'name and ownerEmail are required'
            });
        }

        if (plan && !PLANS[plan]) {
            return res.status(400).json({
                success: false,
                error: `Invalid plan. Must be one of: ${Object.keys(PLANS).join(', ')}`
            });
        }

        // Find owner by email
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const owner = users.find(u => u.email?.toLowerCase() === ownerEmail.toLowerCase());

        if (!owner) {
            throw new HttpError(404, `User not found: ${ownerEmail}`);
        }

        // Check owner isn't already in an org
        const { data: ownerProfile } = await supabaseAdmin
            .from('user_profiles')
            .select('org_id')
            .eq('id', owner.id)
            .single();

        if (ownerProfile?.org_id) {
            return res.status(400).json({
                success: false,
                error: 'User already belongs to an organization'
            });
        }

        // Create org
        const { data: org, error: orgError } = await supabaseAdmin
            .from('organizations')
            .insert({
                name,
                plan,
                owner_id: owner.id,
                max_seats: maxSeats
            })
            .select()
            .single();

        if (orgError) {
            throw new Error(`Failed to create organization: ${orgError.message}`);
        }

        // Set owner's org_id + org_role
        const { error: updateError } = await supabaseAdmin
            .from('user_profiles')
            .update({
                org_id: org.id,
                org_role: 'owner',
                updated_at: new Date().toISOString()
            })
            .eq('id', owner.id);

        if (updateError) {
            throw new Error(`Failed to link owner: ${updateError.message}`);
        }

        console.log(`[Admin] Organization created: ${name} (${org.id}), owner: ${ownerEmail}, plan: ${plan}`);

        res.status(201).json({
            success: true,
            org: {
                id: org.id,
                name: org.name,
                plan: org.plan,
                plan_name: getPlan(org.plan).name,
                max_seats: org.max_seats,
                owner_id: owner.id,
                owner_email: owner.email,
            }
        });
    })
);

/**
 * DELETE /api/admin/users/:userId
 * Delete a user and cascade all related data.
 */
router.delete('/users/:userId',
    asyncHandler(async (req, res) => {
        const { userId } = req.params;

        // Prevent deleting yourself
        if (userId === req.user.id) {
            return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
        }

        // Verify user exists
        const { data: { user: authUser }, error: authError } =
            await supabaseAdmin.auth.admin.getUserById(userId);
        if (authError || !authUser) {
            throw new HttpError(404, 'User not found');
        }

        // 1. Delete chat data (messages cascade via FK)
        const { data: convs } = await supabaseAdmin
            .from('chat_conversations').select('id').eq('user_id', userId);
        if (convs && convs.length > 0) {
            const convIds = convs.map(c => c.id);
            await supabaseAdmin.from('chat_messages').delete().in('conversation_id', convIds);
            await supabaseAdmin.from('chat_conversations').delete().eq('user_id', userId);
        }
        await supabaseAdmin.from('chat_daily_usage').delete().eq('user_id', userId);

        // 2. Delete recordings for user's projects, then projects
        const { data: projects } = await supabaseAdmin
            .from('projects').select('id').eq('user_id', userId);
        if (projects && projects.length > 0) {
            const projectIds = projects.map(p => p.id);
            await supabaseAdmin.from('recordings').delete().in('project_id', projectIds);
        }
        await supabaseAdmin.from('projects').delete().eq('user_id', userId);

        // 3. Delete usage
        await supabaseAdmin.from('usage').delete().eq('user_id', userId);

        // 4. Clear org membership (don't delete the org)
        await supabaseAdmin.from('user_profiles')
            .update({ org_id: null, org_role: null })
            .eq('id', userId);

        // 5. Delete profile
        await supabaseAdmin.from('user_profiles').delete().eq('id', userId);

        // 6. Delete auth user
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (deleteError) {
            throw new Error(`Failed to delete auth user: ${deleteError.message}`);
        }

        console.log(`[Admin] User deleted: ${authUser.email} (${userId})`);
        res.json({ success: true });
    })
);

/**
 * PUT /api/admin/users/:userId/admin
 * Toggle admin status.
 * Body: { is_admin: true | false }
 */
router.put('/users/:userId/admin',
    asyncHandler(async (req, res) => {
        const { userId } = req.params;
        const { is_admin } = req.body;

        if (typeof is_admin !== 'boolean') {
            return res.status(400).json({ success: false, error: 'is_admin must be a boolean' });
        }

        // Prevent removing your own admin
        if (userId === req.user.id && !is_admin) {
            return res.status(400).json({ success: false, error: 'Cannot remove your own admin status' });
        }

        const { data, error } = await supabaseAdmin
            .from('user_profiles')
            .update({ is_admin, updated_at: new Date().toISOString() })
            .eq('id', userId)
            .select('id, is_admin')
            .single();

        if (error) throw new Error(`Failed to update admin status: ${error.message}`);
        if (!data) throw new HttpError(404, 'User not found');

        console.log(`[Admin] Admin status for ${userId}: ${is_admin}`);
        res.json({ success: true, is_admin: data.is_admin });
    })
);

/**
 * POST /api/admin/users/:userId/reset-password
 * Send password reset email via Supabase.
 */
router.post('/users/:userId/reset-password',
    asyncHandler(async (req, res) => {
        const { userId } = req.params;

        const { data: { user: authUser }, error: authError } =
            await supabaseAdmin.auth.admin.getUserById(userId);

        if (authError || !authUser) {
            throw new HttpError(404, 'User not found');
        }

        // Generate recovery link and send email
        const { error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: authUser.email,
        });

        if (linkError) {
            throw new Error(`Failed to send reset email: ${linkError.message}`);
        }

        console.log(`[Admin] Password reset sent for ${authUser.email}`);
        res.json({ success: true, email: authUser.email });
    })
);

/**
 * GET /api/admin/orgs/:orgId
 * Organization detail: info + members + usage.
 */
router.get('/orgs/:orgId',
    asyncHandler(async (req, res) => {
        const { orgId } = req.params;
        const currentMonth = getCurrentMonth();

        // Get org
        const { data: org, error } = await supabaseAdmin
            .from('organizations')
            .select('*')
            .eq('id', orgId)
            .single();

        if (error || !org) {
            throw new HttpError(404, 'Organization not found');
        }

        // Get members, usage, and auth users in parallel
        const [membersResult, usageResult, personalUsageResult, authResult] = await Promise.all([
            supabaseAdmin.from('user_profiles')
                .select('id, org_role, created_at')
                .eq('org_id', orgId),
            supabaseAdmin.from('org_usage')
                .select('responses_count')
                .eq('org_id', orgId).eq('month', currentMonth).maybeSingle(),
            supabaseAdmin.from('usage')
                .select('user_id, responses_count')
                .eq('month', currentMonth),
            supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        ]);

        const emailMap = {};
        if (authResult.data?.users) {
            for (const u of authResult.data.users) {
                emailMap[u.id] = u.email;
            }
        }

        const personalUsageMap = {};
        if (personalUsageResult.data) {
            for (const row of personalUsageResult.data) {
                personalUsageMap[row.user_id] = row.responses_count;
            }
        }

        const members = (membersResult.data || []).map(m => ({
            id: m.id,
            email: emailMap[m.id] || 'unknown',
            role: m.org_role,
            joined_at: m.created_at,
            responses_this_month: personalUsageMap[m.id] || 0,
        }));

        const plan = getPlan(org.plan);

        res.json({
            success: true,
            org: {
                id: org.id,
                name: org.name,
                plan: org.plan,
                plan_name: plan.name,
                max_seats: org.max_seats,
                max_responses: plan.max_responses,
                owner_id: org.owner_id,
                owner_email: emailMap[org.owner_id] || 'unknown',
                created_at: org.created_at,
            },
            members,
            usage: {
                responses_this_month: usageResult.data?.responses_count || 0,
                max_responses: plan.max_responses,
            },
        });
    })
);

/**
 * PUT /api/admin/orgs/:orgId
 * Edit organization.
 * Body: { name?, plan?, maxSeats? }
 */
router.put('/orgs/:orgId',
    asyncHandler(async (req, res) => {
        const { orgId } = req.params;
        const { name, plan, maxSeats } = req.body;

        if (plan && !PLANS[plan]) {
            return res.status(400).json({
                success: false,
                error: `Invalid plan. Must be one of: ${Object.keys(PLANS).join(', ')}`
            });
        }

        const updates = {};
        if (name !== undefined) updates.name = name;
        if (plan !== undefined) updates.plan = plan;
        if (maxSeats !== undefined) updates.max_seats = maxSeats;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        const { data, error } = await supabaseAdmin
            .from('organizations')
            .update(updates)
            .eq('id', orgId)
            .select()
            .single();

        if (error) throw new Error(`Failed to update organization: ${error.message}`);
        if (!data) throw new HttpError(404, 'Organization not found');

        console.log(`[Admin] Organization updated: ${data.name} (${orgId})`);
        res.json({
            success: true,
            org: {
                ...data,
                plan_name: getPlan(data.plan).name,
                max_responses: getPlan(data.plan).max_responses,
            }
        });
    })
);

/**
 * DELETE /api/admin/orgs/:orgId
 * Delete organization and unlink all members.
 */
router.delete('/orgs/:orgId',
    asyncHandler(async (req, res) => {
        const { orgId } = req.params;

        // Verify org exists
        const { data: org, error } = await supabaseAdmin
            .from('organizations')
            .select('id, name')
            .eq('id', orgId)
            .single();

        if (error || !org) {
            throw new HttpError(404, 'Organization not found');
        }

        // 1. Unlink all members
        await supabaseAdmin.from('user_profiles')
            .update({ org_id: null, org_role: null, updated_at: new Date().toISOString() })
            .eq('org_id', orgId);

        // 2. Delete org usage
        await supabaseAdmin.from('org_usage').delete().eq('org_id', orgId);

        // 3. Delete org
        const { error: deleteError } = await supabaseAdmin
            .from('organizations').delete().eq('id', orgId);

        if (deleteError) {
            throw new Error(`Failed to delete organization: ${deleteError.message}`);
        }

        console.log(`[Admin] Organization deleted: ${org.name} (${orgId})`);
        res.json({ success: true });
    })
);

module.exports = router;
