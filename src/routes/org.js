const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');
const { supabaseAdmin } = require('../config/supabase');
const { getPlan, getCurrentMonth } = require('../config/plans');

const router = express.Router();

// All routes require auth
router.use(requireAuth);

/**
 * Middleware: verify caller belongs to an org and is owner.
 */
async function requireOrgOwner(req, res, next) {
    const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('org_id, org_role')
        .eq('id', req.user.id)
        .single();

    if (!profile?.org_id || profile.org_role !== 'owner') {
        return res.status(403).json({
            success: false,
            error: 'Organization owner access required'
        });
    }

    req.orgId = profile.org_id;
    next();
}

/**
 * GET /api/org
 * Get my organization: info, plan, usage, member list with per-member usage.
 */
router.get('/',
    requireOrgOwner,
    asyncHandler(async (req, res) => {
        const orgId = req.orgId;
        const currentMonth = getCurrentMonth();

        // Fetch org + members + usage in parallel
        const [orgResult, membersResult, orgUsageResult] = await Promise.all([
            supabaseAdmin
                .from('organizations')
                .select('id, name, plan, max_seats, owner_id, created_at')
                .eq('id', orgId)
                .single(),
            supabaseAdmin
                .from('user_profiles')
                .select('id, org_role, created_at')
                .eq('org_id', orgId),
            supabaseAdmin
                .from('org_usage')
                .select('responses_count')
                .eq('org_id', orgId)
                .eq('month', currentMonth)
                .maybeSingle(),
        ]);

        if (!orgResult.data) {
            throw new HttpError(404, 'Organization not found');
        }

        const org = orgResult.data;
        const plan = getPlan(org.plan);
        const members = membersResult.data || [];

        // Get emails for all members
        const memberIds = members.map(m => m.id);
        const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const emailMap = {};
        for (const u of authUsers) {
            emailMap[u.id] = u.email;
        }

        // Get per-member usage this month
        const { data: memberUsage } = await supabaseAdmin
            .from('usage')
            .select('user_id, responses_count')
            .in('user_id', memberIds)
            .eq('month', currentMonth);

        const usageMap = {};
        if (memberUsage) {
            for (const row of memberUsage) {
                usageMap[row.user_id] = row.responses_count;
            }
        }

        const enrichedMembers = members.map(m => ({
            id: m.id,
            email: emailMap[m.id] || 'unknown',
            role: m.org_role,
            joined_at: m.created_at,
            responses_this_month: usageMap[m.id] || 0,
        }));

        res.json({
            success: true,
            org: {
                id: org.id,
                name: org.name,
                plan: org.plan,
                plan_name: plan.name,
                max_seats: org.max_seats,
                max_responses: plan.max_responses,
                created_at: org.created_at,
            },
            usage: {
                responses_this_month: orgUsageResult.data?.responses_count || 0,
                month: currentMonth,
            },
            members: enrichedMembers,
        });
    })
);

/**
 * POST /api/org/members
 * Add a member by email. User must already be registered and not in another org.
 * Body: { email: "user@example.com" }
 */
router.post('/members',
    requireOrgOwner,
    asyncHandler(async (req, res) => {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, error: 'Email is required' });
        }

        const orgId = req.orgId;

        // Check seat limit
        const [orgResult, membersResult] = await Promise.all([
            supabaseAdmin.from('organizations').select('max_seats').eq('id', orgId).single(),
            supabaseAdmin.from('user_profiles').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
        ]);

        const maxSeats = orgResult.data?.max_seats || 10;
        const currentMembers = membersResult.count || 0;

        if (currentMembers >= maxSeats) {
            return res.status(400).json({
                success: false,
                error: `Seat limit reached (${maxSeats}). Contact support to increase.`
            });
        }

        // Find user by email
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const targetUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

        if (!targetUser) {
            return res.status(404).json({
                success: false,
                error: 'User not found. They must register first.'
            });
        }

        // Check if user is already in an org
        const { data: profile } = await supabaseAdmin
            .from('user_profiles')
            .select('org_id')
            .eq('id', targetUser.id)
            .single();

        if (profile?.org_id) {
            return res.status(400).json({
                success: false,
                error: 'User already belongs to an organization'
            });
        }

        // Add to org
        const { error: updateError } = await supabaseAdmin
            .from('user_profiles')
            .update({
                org_id: orgId,
                org_role: 'member',
                updated_at: new Date().toISOString()
            })
            .eq('id', targetUser.id);

        if (updateError) {
            throw new Error(`Failed to add member: ${updateError.message}`);
        }

        console.log(`[Org] Member added: ${email} → org ${orgId}`);

        res.json({
            success: true,
            member: {
                id: targetUser.id,
                email: targetUser.email,
                role: 'member'
            }
        });
    })
);

/**
 * DELETE /api/org/members/:userId
 * Remove a member from the organization. Cannot remove the owner.
 */
router.delete('/members/:userId',
    requireOrgOwner,
    asyncHandler(async (req, res) => {
        const { userId } = req.params;
        const orgId = req.orgId;

        // Cannot remove yourself (owner)
        if (userId === req.user.id) {
            return res.status(400).json({
                success: false,
                error: 'Cannot remove the organization owner'
            });
        }

        // Verify user is in this org
        const { data: profile } = await supabaseAdmin
            .from('user_profiles')
            .select('org_id, org_role')
            .eq('id', userId)
            .single();

        if (!profile || profile.org_id !== orgId) {
            throw new HttpError(404, 'Member not found in this organization');
        }

        // Remove from org
        const { error: updateError } = await supabaseAdmin
            .from('user_profiles')
            .update({
                org_id: null,
                org_role: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId);

        if (updateError) {
            throw new Error(`Failed to remove member: ${updateError.message}`);
        }

        console.log(`[Org] Member removed: ${userId} from org ${orgId}`);

        res.json({ success: true });
    })
);

module.exports = router;
