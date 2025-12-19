const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sourceImage = path.join(__dirname, '..', 'public', 'unnamed.jpg');
const publicDir = path.join(__dirname, '..', 'public');

const sizes = [
    { name: 'favicon-16x16.png', size: 16 },
    { name: 'favicon-32x32.png', size: 32 },
    { name: 'android-chrome-192x192.png', size: 192 },
    { name: 'android-chrome-512x512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
];

async function generateFavicons() {
    console.log('🎨 Generating favicons...');

    // Check if source image exists
    if (!fs.existsSync(sourceImage)) {
        console.error(`❌ Source image not found: ${sourceImage}`);
        process.exit(1);
    }

    try {
        // Generate each size
        for (const { name, size } of sizes) {
            const outputPath = path.join(publicDir, name);

            await sharp(sourceImage)
                .resize(size, size, {
                    fit: 'contain',
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
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 0 }
            })
            .toFormat('png')
            .toFile(icoPath);

        console.log(`✅ Generated favicon.ico (32x32)`);

        console.log('\n🎉 All favicons generated successfully!');
        console.log('\n📝 Next steps:');
        console.log('   1. Check the generated files in the public directory');
        console.log('   2. You can delete unnamed.jpg if you no longer need it');

    } catch (error) {
        console.error('❌ Error generating favicons:', error.message);
        process.exit(1);
    }
}

generateFavicons();
