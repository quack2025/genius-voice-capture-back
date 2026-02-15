const { supabaseAdmin } = require('../config/supabase');
const config = require('../config');
const { getExtensionFromMimeType } = require('./audioUtils');

/**
 * Upload audio file to Supabase Storage
 * @param {Buffer} fileBuffer - Audio file buffer
 * @param {string} projectId - Project UUID
 * @param {string} sessionId - Session ID from Alchemer
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<{path: string, size: number}>}
 */
async function uploadAudio(fileBuffer, projectId, sessionId, mimeType) {
    const timestamp = Date.now();
    const extension = getExtensionFromMimeType(mimeType);
    const filePath = `${projectId}/${sessionId}_${timestamp}.${extension}`;

    const { data, error } = await supabaseAdmin.storage
        .from(config.storageBucket)
        .upload(filePath, fileBuffer, {
            contentType: mimeType,
            upsert: false
        });

    if (error) {
        throw new Error(`Failed to upload audio: ${error.message}`);
    }

    return {
        path: data.path,
        size: fileBuffer.length
    };
}

/**
 * Get signed URL for audio file
 * @param {string} audioPath - Path in storage
 * @returns {Promise<string>}
 */
async function getSignedUrl(audioPath) {
    const { data, error } = await supabaseAdmin.storage
        .from(config.storageBucket)
        .createSignedUrl(audioPath, config.signedUrlExpiration);

    if (error) {
        throw new Error(`Failed to create signed URL: ${error.message}`);
    }

    return data.signedUrl;
}

/**
 * Delete audio file from storage
 * @param {string} audioPath - Path in storage
 * @returns {Promise<void>}
 */
async function deleteAudio(audioPath) {
    const { error } = await supabaseAdmin.storage
        .from(config.storageBucket)
        .remove([audioPath]);

    if (error) {
        throw new Error(`Failed to delete audio: ${error.message}`);
    }
}

/**
 * Delete all audio files for a project
 * @param {string} projectId - Project UUID
 * @returns {Promise<void>}
 */
async function deleteProjectAudios(projectId) {
    // List all files in the project folder
    const { data: files, error: listError } = await supabaseAdmin.storage
        .from(config.storageBucket)
        .list(projectId);

    if (listError) {
        throw new Error(`Failed to list project files: ${listError.message}`);
    }

    if (files && files.length > 0) {
        const filePaths = files.map(file => `${projectId}/${file.name}`);

        const { error: deleteError } = await supabaseAdmin.storage
            .from(config.storageBucket)
            .remove(filePaths);

        if (deleteError) {
            throw new Error(`Failed to delete project files: ${deleteError.message}`);
        }
    }
}

/**
 * Validate audio file
 * @param {Object} file - Multer file object
 * @returns {{valid: boolean, error?: string}}
 */
function validateAudioFile(file) {
    if (!file) {
        return { valid: false, error: 'No audio file provided' };
    }

    // Check MIME type
    if (!config.allowedAudioMimeTypes.includes(file.mimetype)) {
        return {
            valid: false,
            error: `Invalid audio format. Supported: ${config.allowedAudioMimeTypes.join(', ')}`
        };
    }

    // Check empty file
    if (file.size === 0) {
        return { valid: false, error: 'Empty audio file' };
    }

    // Check file size
    const maxSizeBytes = config.maxAudioSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
        return {
            valid: false,
            error: `File too large. Maximum size: ${config.maxAudioSizeMB}MB`
        };
    }

    return { valid: true };
}

module.exports = {
    uploadAudio,
    getSignedUrl,
    deleteAudio,
    deleteProjectAudios,
    validateAudioFile
};
