const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage, registerFont } = require('canvas');

async function test() {
    const inputPath = 'uploads/flyers/2025-12-18T05-10-54-495Z_My_Flyer_Campaign/template_original.png';
    const outputPath = 'debug_canvas_output.png';

    if (!fs.existsSync(inputPath)) {
        console.error('Input file not found:', inputPath);
        return;
    }

    try {
        console.log('Loading image...');
        // Pre-process image with sharp to handle rotation
        const normalizedBuffer = await sharp(inputPath).rotate().toBuffer();
        const metadata = await sharp(normalizedBuffer).metadata();
        const width = metadata.width;
        const height = metadata.height;
        console.log(`Dimensions: ${width}x${height}`);

        const image = await loadImage(normalizedBuffer);

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = 'red';
        ctx.fillRect(0, 0, width, height); // Debug: Fill red first to see if canvas works

        ctx.drawImage(image, 0, 0, width, height);

        const x = 500;
        const y = 500;
        const fontSize = 150;
        const text = "HELLO CANVAS";
        const color = "#ff0000"; // Red text

        ctx.fillStyle = color;
        // Try a safe font
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';

        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;

        console.log(`Drawing text '${text}' at ${x},${y} font ${fontSize}px`);
        ctx.fillText(text, x, y);

        // Draw a rect to ensure something is drawn
        ctx.strokeStyle = 'green';
        ctx.lineWidth = 20;
        ctx.strokeRect(x, y, 500, 200);

        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(outputPath, buffer);
        console.log('Saved to', outputPath);

    } catch (e) {
        console.error('Error:', e);
    }
}

test();
