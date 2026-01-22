const { Parser } = require('json2csv');

/**
 * Convierte un array de grabaciones a formato CSV
 * @param {Array} recordings - Array de objetos de grabación
 * @returns {string} - String CSV
 */
function recordingsToCSV(recordings) {
    const fields = [
        'session_id',
        'question_id',
        'transcription',
        'duration_seconds',
        'status',
        'language_detected',
        'created_at',
        'transcribed_at'
    ];

    const opts = {
        fields,
        defaultValue: '',
        quote: '"'
    };

    const parser = new Parser(opts);
    return parser.parse(recordings);
}

/**
 * Parsea session_ids desde un string o array
 * @param {string|Array} input - Session IDs separados por coma, newline, o array
 * @returns {Array<string>} - Array de session_ids limpios
 */
function parseSessionIds(input) {
    if (Array.isArray(input)) {
        return input.map(id => id.trim()).filter(Boolean);
    }

    if (typeof input === 'string') {
        // Soporta separación por coma, punto y coma, o newline
        return input
            .split(/[,;\n\r]+/)
            .map(id => id.trim())
            .filter(Boolean);
    }

    return [];
}

module.exports = {
    recordingsToCSV,
    parseSessionIds
};
