/**
 * Domain validation utilities for project-level domain locking.
 *
 * When a project has `settings.allowed_domains` configured, only requests
 * from those domains are accepted. This prevents someone from copying the
 * widget code + project key and using them on an unauthorized domain.
 */

/**
 * Extract the origin (scheme + host) from the request.
 * Prefers the Origin header; falls back to parsing Referer.
 */
function getRequestOrigin(req) {
    if (req.headers.origin) return req.headers.origin;
    if (req.headers.referer) {
        try {
            return new URL(req.headers.referer).origin;
        } catch (e) { /* invalid referer, fall through */ }
    }
    return null;
}

/**
 * Check if an origin is allowed by a list of domain patterns.
 *
 * @param {string|null} origin  - Full origin (e.g. "https://app.alchemer.com")
 * @param {string[]}    allowedDomains - Pattern list (e.g. ["*.alchemer.com", "mysite.com"])
 * @returns {boolean}
 *
 * Rules:
 * - Empty/missing allowedDomains → allow all (opt-in feature, backward compatible)
 * - Wildcard "*.example.com" matches "sub.example.com" and "example.com"
 * - Exact "example.com" matches only "example.com"
 * - localhost / 127.0.0.1 always allowed (development convenience)
 * - Missing origin with domain locking active → blocked (fail closed)
 */
function isDomainAllowed(origin, allowedDomains) {
    // No restrictions configured → allow all
    if (!allowedDomains || !Array.isArray(allowedDomains) || allowedDomains.length === 0) {
        return true;
    }

    if (!origin) return false;

    let hostname;
    try {
        hostname = new URL(origin).hostname;
    } catch (e) {
        hostname = origin; // bare hostname
    }

    // Always allow localhost for development/testing
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;

    for (const pattern of allowedDomains) {
        if (pattern.startsWith('*.')) {
            // Wildcard: *.example.com matches sub.example.com AND example.com
            const suffix = pattern.slice(2);
            if (hostname === suffix || hostname.endsWith('.' + suffix)) {
                return true;
            }
        } else {
            // Exact match
            if (hostname === pattern) return true;
        }
    }

    return false;
}

module.exports = { getRequestOrigin, isDomainAllowed };
