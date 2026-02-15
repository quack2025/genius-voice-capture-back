/**
 * Shared audio utilities — single source of truth for language codes and MIME mappings.
 * Used by whisper.js, storage.js, and validators/schemas.js.
 */

// All languages supported by OpenAI Whisper API (ISO 639-1 codes)
const VALID_LANGUAGES = [
    'es', 'en', 'pt', 'fr', 'de', 'it', 'ja', 'ko', 'zh',
    'nl', 'ru', 'ar', 'hi', 'tr', 'pl', 'sv', 'no', 'da',
    'fi', 'el', 'cs', 'ro', 'hu', 'th', 'id', 'ms', 'vi',
    'uk', 'ca', 'hr', 'bg', 'sk', 'sl', 'sr', 'he', 'fa'
];

/**
 * Get file extension from MIME type
 * @param {string} mimeType
 * @returns {string}
 */
function getExtensionFromMimeType(mimeType) {
    const extensions = {
        'audio/webm': 'webm',
        'audio/mp3': 'mp3',
        'audio/mpeg': 'mp3',
        'audio/wav': 'wav',
        'audio/mp4': 'mp4',
        'audio/ogg': 'ogg'
    };
    return extensions[mimeType] || 'webm';
}

/**
 * Get MIME type from file extension
 * @param {string} extension
 * @returns {string}
 */
function getMimeType(extension) {
    const mimeTypes = {
        'webm': 'audio/webm',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'mp4': 'audio/mp4',
        'ogg': 'audio/ogg',
        'mpeg': 'audio/mpeg'
    };
    return mimeTypes[extension.toLowerCase()] || 'audio/webm';
}

module.exports = {
    VALID_LANGUAGES,
    getExtensionFromMimeType,
    getMimeType
};
