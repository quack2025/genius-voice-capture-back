const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { supabaseAdmin } = require('../config/supabase');
const { anthropic } = require('../config/anthropic');
const { getPlan } = require('../config/plans');
const { getSystemPrompt } = require('../prompts/helpChatSystem');

const router = express.Router();

// Multer config for image uploads (max 5MB, images only)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    },
});

// Helper: get today's date as YYYY-MM-DD
function getToday() {
    return new Date().toISOString().split('T')[0];
}

// Helper: get user plan key
async function getUserPlan(userId) {
    const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('plan, org_id')
        .eq('id', userId)
        .single();

    if (!profile) return 'free';

    // If user is in an org, use the org's plan
    if (profile.org_id) {
        const { data: org } = await supabaseAdmin
            .from('organizations')
            .select('plan')
            .eq('id', profile.org_id)
            .single();
        return org?.plan || profile.plan || 'free';
    }

    return profile.plan || 'free';
}

// Helper: get user context for system prompt
async function getUserContext(userId, extraContext = {}) {
    const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('plan, org_id, org_role')
        .eq('id', userId)
        .single();

    const planKey = profile?.plan || 'free';
    const plan = getPlan(planKey);

    // Get usage & project count
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const [usageResult, projectsResult] = await Promise.all([
        supabaseAdmin.from('usage').select('responses_count')
            .eq('user_id', userId).eq('month', currentMonth).maybeSingle(),
        supabaseAdmin.from('projects').select('id', { count: 'exact', head: true })
            .eq('user_id', userId),
    ]);

    let orgName = null;
    if (profile?.org_id) {
        const { data: org } = await supabaseAdmin
            .from('organizations').select('name').eq('id', profile.org_id).single();
        orgName = org?.name || null;
    }

    return {
        plan_name: plan.name,
        max_responses: plan.max_responses,
        responses_this_month: usageResult?.data?.responses_count || 0,
        projects_count: projectsResult?.count || 0,
        current_page: extraContext.current_page || '/dashboard',
        org_name: orgName,
        language: extraContext.language || 'es',
    };
}

// ─── GET /conversations ─── List user's conversations
router.get('/conversations', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('chat_conversations')
            .select('id, title, updated_at')
            .eq('user_id', req.user.id)
            .order('updated_at', { ascending: false })
            .limit(20);

        if (error) throw error;
        res.json({ conversations: data || [] });
    } catch (err) {
        console.error('List conversations error:', err);
        res.status(500).json({ error: 'Failed to load conversations' });
    }
});

// ─── POST /conversations ─── Create new conversation
router.post('/conversations', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('chat_conversations')
            .insert({ user_id: req.user.id })
            .select('id')
            .single();

        if (error) throw error;
        res.json({ id: data.id });
    } catch (err) {
        console.error('Create conversation error:', err);
        res.status(500).json({ error: 'Failed to create conversation' });
    }
});

// ─── GET /conversations/:id ─── Get conversation messages
router.get('/conversations/:id', requireAuth, async (req, res) => {
    try {
        // Verify ownership
        const { data: conv } = await supabaseAdmin
            .from('chat_conversations')
            .select('id')
            .eq('id', req.params.id)
            .eq('user_id', req.user.id)
            .single();

        if (!conv) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const { data: messages, error } = await supabaseAdmin
            .from('chat_messages')
            .select('id, role, content, image_url, created_at')
            .eq('conversation_id', req.params.id)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Also return remaining messages today
        const today = getToday();
        const planKey = await getUserPlan(req.user.id);
        const plan = getPlan(planKey);
        const { data: dailyUsage } = await supabaseAdmin
            .from('chat_daily_usage')
            .select('message_count')
            .eq('user_id', req.user.id)
            .eq('date', today)
            .maybeSingle();

        const used = dailyUsage?.message_count || 0;
        const limit = plan.chat_messages_per_day || 5;

        res.json({
            messages: messages || [],
            remaining_today: Math.max(0, limit - used),
            daily_limit: limit,
        });
    } catch (err) {
        console.error('Get messages error:', err);
        res.status(500).json({ error: 'Failed to load messages' });
    }
});

// ─── POST /message ─── Send message and get Claude response
router.post('/message', requireAuth, async (req, res) => {
    try {
        const { conversation_id, content, image_url, context } = req.body;

        if (!conversation_id || !content) {
            return res.status(400).json({ error: 'conversation_id and content are required' });
        }

        // 1. Check daily limit
        const today = getToday();
        const planKey = await getUserPlan(req.user.id);
        const plan = getPlan(planKey);
        const dailyLimit = plan.chat_messages_per_day || 5;

        const { data: dailyUsage } = await supabaseAdmin
            .from('chat_daily_usage')
            .select('message_count')
            .eq('user_id', req.user.id)
            .eq('date', today)
            .maybeSingle();

        const currentCount = dailyUsage?.message_count || 0;
        if (currentCount >= dailyLimit) {
            return res.status(429).json({
                error: 'Daily chat limit reached',
                remaining_today: 0,
                daily_limit: dailyLimit,
            });
        }

        // 2. Verify conversation ownership
        const { data: conv } = await supabaseAdmin
            .from('chat_conversations')
            .select('id, title')
            .eq('id', conversation_id)
            .eq('user_id', req.user.id)
            .single();

        if (!conv) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        // 3. Load conversation history (last 20 messages)
        const { data: history } = await supabaseAdmin
            .from('chat_messages')
            .select('role, content, image_url')
            .eq('conversation_id', conversation_id)
            .order('created_at', { ascending: true })
            .limit(20);

        // 4. Build Claude messages from history
        const claudeMessages = (history || []).map(msg => {
            if (msg.image_url && msg.role === 'user') {
                return {
                    role: 'user',
                    content: [
                        { type: 'text', text: msg.content },
                    ],
                };
            }
            return { role: msg.role, content: msg.content };
        });

        // Build the new user message content
        const userContent = [];
        if (image_url) {
            // Download image from Supabase storage and convert to base64
            try {
                const response = await fetch(image_url);
                if (response.ok) {
                    const buffer = await response.arrayBuffer();
                    const base64 = Buffer.from(buffer).toString('base64');
                    const contentType = response.headers.get('content-type') || 'image/png';
                    userContent.push({
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: contentType,
                            data: base64,
                        },
                    });
                }
            } catch (imgErr) {
                console.warn('Failed to fetch image for Claude:', imgErr.message);
            }
        }
        userContent.push({ type: 'text', text: content });
        claudeMessages.push({ role: 'user', content: userContent });

        // 5. Get system prompt with user context
        const userContext = await getUserContext(req.user.id, {
            current_page: context?.current_page,
            language: context?.language,
        });
        const systemPrompt = getSystemPrompt(userContext);

        // 6. Call Claude
        const claudeResponse = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            system: systemPrompt,
            messages: claudeMessages,
        });

        const assistantText = claudeResponse.content
            .filter(block => block.type === 'text')
            .map(block => block.text)
            .join('');

        // 7. Save both messages to DB
        await supabaseAdmin.from('chat_messages').insert([
            {
                conversation_id,
                role: 'user',
                content,
                image_url: image_url || null,
            },
            {
                conversation_id,
                role: 'assistant',
                content: assistantText,
            },
        ]);

        // 8. Increment daily usage
        await supabaseAdmin.from('chat_daily_usage').upsert({
            user_id: req.user.id,
            date: today,
            message_count: currentCount + 1,
        }, { onConflict: 'user_id,date' });

        // 9. Update conversation title (from first message) and updated_at
        const updates = { updated_at: new Date().toISOString() };
        if (!conv.title) {
            updates.title = content.substring(0, 60);
        }
        await supabaseAdmin
            .from('chat_conversations')
            .update(updates)
            .eq('id', conversation_id);

        // 10. Return response
        res.json({
            message: {
                role: 'assistant',
                content: assistantText,
            },
            remaining_today: Math.max(0, dailyLimit - (currentCount + 1)),
            daily_limit: dailyLimit,
        });
    } catch (err) {
        console.error('Chat message error:', err);
        res.status(500).json({ error: 'Failed to process message' });
    }
});

// ─── POST /upload-image ─── Upload screenshot to Supabase storage
router.post('/upload-image', requireAuth, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image provided' });
        }

        const ext = req.file.mimetype.split('/')[1] || 'png';
        const filePath = `${req.user.id}/${uuidv4()}.${ext}`;

        const { error: uploadError } = await supabaseAdmin.storage
            .from('chat-images')
            .upload(filePath, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: false,
            });

        if (uploadError) throw uploadError;

        // Get signed URL (1 hour)
        const { data: signedData, error: signedError } = await supabaseAdmin.storage
            .from('chat-images')
            .createSignedUrl(filePath, 3600);

        if (signedError) throw signedError;

        res.json({ url: signedData.signedUrl });
    } catch (err) {
        console.error('Image upload error:', err);
        res.status(500).json({ error: 'Failed to upload image' });
    }
});

module.exports = router;
