const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sourceImage = path.join(__dirname, '..', 'public', 'ChatGPT Image Dec 19, 2025, 02_05_56 PM.png');
const publicDir = path.join(__dirname, '..', 'public');

const sizes = [
    { name: 'favicon-16x16.png', size: 16 },
    { name: 'favicon-32x32.png', size: 32 },
    { name: 'android-chrome-192x192.png', size: 192 },
    { name: 'android-chrome-512x512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
];

async function generateFavicons() {
    console.log('🎨 Generating favicons with bigger logo...');

    // Check if source image exists
    if (!fs.existsSync(sourceImage)) {
        console.error(`❌ Source image not found: ${sourceImage}`);
        process.exit(1);
    }

    try {
        // Generate each size with 'cover' fit to make logo bigger
        for (const { name, size } of sizes) {
            const outputPath = path.join(publicDir, name);

            await sharp(sourceImage)
                .resize(size, size, {
                    fit: 'cover',  // Changed from 'contain' to 'cover' for bigger logo
                    position: 'center',
                    background: { r: 255, g: 255, b: 255, alpha: 0 }
                })
                .png()
                .toFile(outputPath);

            console.log(`✅ Generated ${name} (${size}x${size})`);
        }

        // Generate favicon.ico (using 32x32 as base)
        const icoPath = path.join(publicDir, 'favicon.ico');
        await sharp(sourceImage)
            .resize(32, 32, {
                fit: 'cover',  // Changed from 'contain' to 'cover' for bigger logo
                position: 'center',
                background: { r: 255, g: 255, b: 255, alpha: 0 }
            })
            .toFormat('png')
            .toFile(icoPath);

        console.log(`✅ Generated favicon.ico (32x32)`);

        console.log('\n🎉 All favicons generated successfully with bigger UH logo!');
        console.log('\n📝 Files generated:');
        sizes.forEach(({ name, size }) => {
            console.log(`   - ${name} (${size}x${size})`);
        });
        console.log('   - favicon.ico (32x32)');

    } catch (error) {
        console.error('❌ Error generating favicons:', error.message);
        process.exit(1);
    }
}

generateFavicons();
