/**
 * Detect survey platform from request origin/referer URL.
 * Returns a slug used for analytics in recording metadata.
 */
function detectPlatform(origin) {
	if (!origin) return 'unknown';
	try {
		const hostname = new URL(origin).hostname;
		if (/alchemer\.com|surveygizmo\.com|alchemer\.eu/.test(hostname)) return 'alchemer';
		if (/qualtrics\.com/.test(hostname)) return 'qualtrics';
		if (/surveymonkey\.com/.test(hostname)) return 'surveymonkey';
		if (/questionpro\.com/.test(hostname)) return 'questionpro';
		if (/jotform\.com|jotform\.pro/.test(hostname)) return 'jotform';
		if (/typeform\.com/.test(hostname)) return 'typeform';
		if (/formstack\.com/.test(hostname)) return 'formstack';
		return 'other';
	} catch (e) { return 'unknown'; }
}

/**
 * Build enriched metadata with origin tracking.
 * Prefixed with _ to mark system-injected fields.
 */
function enrichMetadata(metadata, req) {
	const rawOrigin = req.headers.origin || req.headers.referer || null;
	// Sanitize: validate as URL and truncate to prevent storage abuse
	let safeOrigin = null;
	if (rawOrigin) {
		try {
			const parsed = new URL(rawOrigin);
			safeOrigin = parsed.origin.substring(0, 2048);
		} catch {
			safeOrigin = 'invalid';
		}
	}
	return {
		...(metadata || {}),
		_origin: safeOrigin,
		_platform: detectPlatform(rawOrigin),
	};
}

module.exports = { detectPlatform, enrichMetadata };
