/**
 * Build script: minify + obfuscate the voice widget for production.
 * Reads src/widget/voice.js → writes dist/voice.min.js
 *
 * Usage: node scripts/build-widget.js
 */
const { minify } = require('terser');
const fs = require('fs');
const path = require('path');

async function build() {
    const sourceFile = path.join(__dirname, '..', 'src', 'widget', 'voice.js');
    const outputFile = path.join(__dirname, '..', 'dist', 'voice.min.js');

    const source = fs.readFileSync(sourceFile, 'utf8');
    const sourceBytes = Buffer.byteLength(source, 'utf8');

    const result = await minify(source, {
        compress: {
            passes: 2,
            pure_funcs: ['console.log'] // keep warn/error for debugging
        },
        mangle: {
            reserved: ['GeniusVoice'] // preserve global API name
        },
        output: {
            comments: false // strip all comments (integration docs, etc.)
        }
    });

    if (result.error) {
        throw result.error;
    }

    // Ensure dist directory exists
    const distDir = path.dirname(outputFile);
    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
    }

    fs.writeFileSync(outputFile, result.code, 'utf8');
    const minBytes = Buffer.byteLength(result.code, 'utf8');
    const ratio = ((1 - minBytes / sourceBytes) * 100).toFixed(1);

    console.log(`Widget built: ${outputFile}`);
    console.log(`  Source: ${sourceBytes} bytes → Minified: ${minBytes} bytes (${ratio}% smaller)`);
}

build().catch(err => {
    console.error('Widget build failed:', err);
    process.exit(1);
});
