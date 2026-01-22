const { openai } = require('../config/openai');
const { supabaseAdmin } = require('../config/supabase');
const config = require('../config');

/**
 * Transcribe audio file using OpenAI Whisper
 * @param {string} audioPath - Path in Supabase Storage
 * @param {string} language - Expected language (es, en, pt, etc.)
 * @returns {Promise<{text: string, language: string, duration: number}>}
 */
async function transcribeAudio(audioPath, language = 'es') {
    // 1. Download audio from Supabase Storage
    const { data, error } = await supabaseAdmin.storage
        .from(config.storageBucket)
        .download(audioPath);

    if (error) {
        throw new Error(`Failed to download audio: ${error.message}`);
    }

    // 2. Convert Blob to File-like object for OpenAI
    const audioBuffer = Buffer.from(await data.arrayBuffer());

    // Determine file extension from path
    const extension = audioPath.split('.').pop() || 'webm';
    const mimeType = getMimeType(extension);

    const audioFile = new File([audioBuffer], `audio.${extension}`, { type: mimeType });

    // 3. Call Whisper API
    const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: language,
        response_format: 'verbose_json'
    });

    return {
        text: transcription.text,
        language: transcription.language,
        duration: transcription.duration
    };
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

/**
 * Calculate estimated cost for transcription
 * @param {number} durationSeconds - Total duration in seconds
 * @returns {number} - Estimated cost in USD
 */
function calculateTranscriptionCost(durationSeconds) {
    const minutes = durationSeconds / 60;
    return Math.ceil(minutes * config.whisperCostPerMinute * 10000) / 10000;
}

module.exports = {
    transcribeAudio,
    calculateTranscriptionCost
};
