const Anthropic = require('@anthropic-ai/sdk');

if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('Warning: Missing ANTHROPIC_API_KEY — chat feature will not work');
}

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
});

module.exports = { anthropic };
