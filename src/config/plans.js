/**
 * Plan definitions — single source of truth for tier limits.
 * No database table needed — only 4 fixed plans.
 *
 * Pricing strategy (v2.0):
 *   Free      → generous trial, 100 responses
 *   Starter   → $39/mo, 1,500 resp ($0.026/resp)  [key: freelancer]
 *   Pro       → $199/mo, 10,000 resp ($0.020/resp)
 *   Enterprise → $499/mo, 50,000 resp ($0.010/resp)
 */

const PLANS = {
    free: {
        name: 'Free',
        price: 0,
        max_responses: 100,
        max_projects: 2,
        max_duration: 90,
        languages: ['es'],
        export_formats: ['csv'],
        batch: false,
        show_branding: true,
        custom_themes: false,
        custom_domains: false,
        chat_messages_per_day: 5
    },
    freelancer: {
        name: 'Starter',
        price: 39,
        max_responses: 1500,
        max_projects: 10,
        max_duration: 180,
        languages: ['es', 'en', 'pt', 'fr', 'de', 'it', 'ja', 'ko', 'zh'],
        export_formats: ['csv', 'xlsx'],
        batch: true,
        show_branding: false,
        custom_themes: false,
        custom_domains: false,
        chat_messages_per_day: 20
    },
    pro: {
        name: 'Pro',
        price: 199,
        max_responses: 10000,
        max_projects: null, // unlimited
        max_duration: 300,
        languages: null, // all languages
        export_formats: ['csv', 'xlsx', 'api'],
        batch: true,
        show_branding: false,
        custom_themes: true,
        custom_domains: true,
        chat_messages_per_day: 50
    },
    enterprise: {
        name: 'Enterprise',
        price: 499,
        max_responses: 50000,
        max_projects: null, // unlimited
        max_duration: 600,
        languages: null, // all languages
        export_formats: ['csv', 'xlsx', 'api'],
        batch: true,
        show_branding: false,
        custom_themes: true,
        custom_domains: true,
        chat_messages_per_day: 100
    }
};

function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getPlan(planKey) {
    return PLANS[planKey] || PLANS.free;
}

module.exports = { PLANS, getCurrentMonth, getPlan };
