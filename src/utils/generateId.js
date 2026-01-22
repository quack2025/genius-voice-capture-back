const crypto = require('crypto');

/**
 * Genera un ID único con prefijo
 * @param {string} prefix - Prefijo (proj_, rec_, batch_)
 * @returns {string}
 */
function generateId(prefix = '') {
    const randomPart = crypto.randomBytes(9).toString('base64url');
    return `${prefix}${randomPart}`;
}

/**
 * Genera un public key para proyectos
 * @returns {string}
 */
function generateProjectKey() {
    return generateId('proj_');
}

/**
 * Genera un ID para batches
 * @returns {string}
 */
function generateBatchId() {
    return generateId('batch_');
}

module.exports = {
    generateId,
    generateProjectKey,
    generateBatchId
};
