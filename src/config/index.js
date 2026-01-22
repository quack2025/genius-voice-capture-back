require('dotenv').config();

const config = {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',

    // Límites de audio
    maxAudioSizeMB: parseInt(process.env.MAX_AUDIO_SIZE_MB, 10) || 10,
    maxAudioDurationSeconds: parseInt(process.env.MAX_AUDIO_DURATION_SECONDS, 10) || 180,

    // Formatos de audio permitidos
    allowedAudioMimeTypes: [
        'audio/webm',
        'audio/mp3',
        'audio/mpeg',
        'audio/wav',
        'audio/mp4',
        'audio/ogg'
    ],

    // Storage
    storageBucket: 'voice-recordings',

    // Signed URL expiration (1 hour)
    signedUrlExpiration: 3600,

    // Whisper cost per minute (USD)
    whisperCostPerMinute: 0.006,

    // CORS origins
    allowedOrigins: [
        'https://voice.geniuslabs.ai',
        'http://localhost:3000',
        'http://localhost:5173'
    ],

    wildcardPatterns: [
        /^https:\/\/.*\.lovable\.app$/,
        /^https:\/\/.*\.alchemer\.com$/,
        /^https:\/\/.*\.alchemer\.eu$/
    ]
};

module.exports = config;
