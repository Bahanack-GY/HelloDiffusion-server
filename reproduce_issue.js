const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

async function test() {
    console.log('Starting exact reproduction test...');

    // MOCK INPUTS
    const fileBuffer = fs.readFileSync('uploads/flyers/2025-12-18T05-10-54-495Z_My_Flyer_Campaign/template_original.png');
    // Mock config from what frontend might send
    const config = {
        x: 100,
        y: 100,
        fontSize: 50,
        color: '#ff0000', // RED for visibility
        previewWidth: 500,  // Mock preview width
        previewHeight: 500  // Mock preview height (aspect ratio might differ)
    };
    const recipients = [{ phone: '123456789', name: 'Test User' }];

    // LOGIC FROM MessagingService
    try {
        console.log('Rotating image...');
        const normalizedBuffer = await sharp(fileBuffer).rotate().toBuffer();

        const metadata = await sharp(normalizedBuffer).metadata();
        const width = metadata.width;
        const height = metadata.height;
        console.log(`Original Dimensions: ${width}x${height}`);

        let scaleX = 1;
        let scaleY = 1;

        if (config.previewWidth && config.previewWidth > 0) {
            scaleX = width / config.previewWidth;
        }
        if (config.previewHeight && config.previewHeight > 0) {
            scaleY = height / config.previewHeight;
        }

        const finalX = Math.round(config.x * scaleX);
        const finalY = Math.round(config.y * scaleY);
        // Limit font size minimum to avoid invisible text
        const finalFontSize = Math.max(10, Math.round(config.fontSize * scaleX));

        console.log(`Flyer Debug: Original ${width}x${height}, Preview ${config.previewWidth}x${config.previewHeight}`);
        console.log(`Flyer Debug: Scale X=${scaleX}, Y=${scaleY}`);
        console.log(`Flyer Debug: Input X=${config.x}, Y=${config.y}, Font=${config.fontSize}`);
        console.log(`Flyer Debug: Final X=${finalX}, Y=${finalY}, Font=${finalFontSize}`);

        const image = await loadImage(normalizedBuffer);

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        ctx.drawImage(image, 0, 0, width, height);

        ctx.fillStyle = config.color;
        // Using the same font string
        ctx.font = `bold ${finalFontSize}px "Noto Sans", "DejaVu Sans", "Ubuntu", sans-serif`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';

        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;

        const nameToPrint = recipients[0].name;
        console.log(`Drawing text '${nameToPrint}' at ${finalX},${finalY}`);
        ctx.fillText(nameToPrint, finalX, finalY);

        // Debug box
        ctx.strokeStyle = 'blue';
        ctx.strokeRect(finalX, finalY, 500, 200);

        const outputBuffer = canvas.toBuffer('image/png');
        fs.writeFileSync('reproduce_output.png', outputBuffer);
        console.log('Saved reproduce_output.png');

    } catch (error) {
        console.error('Error:', error);
    }
}

test();
