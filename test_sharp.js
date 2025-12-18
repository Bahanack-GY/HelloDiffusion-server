const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function test() {
    const inputPath = 'uploads/flyers/2025-12-18T04-58-45-220Z_My_Flyer_Campaign/template_original.png';
    const outputPath = 'debug_output.png';

    if (!fs.existsSync(inputPath)) {
        console.error('Input file not found:', inputPath);
        return;
    }

    try {
        const metadata = await sharp(inputPath).metadata();
        console.log('Metadata:', metadata);
        const width = metadata.width;
        const height = metadata.height;

        console.log(`Image dimensions: ${width}x${height}`);

        const x = 100;
        const y = 100;
        const fontSize = 100;
        const text = "TEST TEXT";
        const color = "#ffffff";

        const svgBuffer = Buffer.from(
            `<svg width="${width}" height="${height}">
                <style>
                    .title { fill: ${color}; font-size: ${fontSize}px; font-weight: bold; font-family: sans-serif; text-anchor: start; dominant-baseline: text-before-edge; }
                </style>
                <text x="${x}" y="${y}" class="title">${text}</text>
                <rect x="${x}" y="${y}" width="${width - x}" height="10" fill="red" />
            </svg>`
        );

        await sharp(inputPath)
            .rotate()
            .composite([{ input: svgBuffer }])
            .toFile(outputPath);

        console.log('Created', outputPath);

    } catch (e) {
        console.error(e);
    }
}

test();
