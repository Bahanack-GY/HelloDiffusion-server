import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message, MessageStatus } from './entities/message.entity';
import { Invitation } from './entities/invitation.entity'; // Import Invitation
import { SendMessageDto } from './dto/send-message.dto';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class MessagingService {
    private readonly logger = new Logger(MessagingService.name);

    constructor(
        @InjectRepository(Message)
        private messageRepository: Repository<Message>,
        @InjectRepository(Invitation)
        private invitationRepository: Repository<Invitation>,
        private whatsappService: WhatsappService,
    ) { }

    async send(createMessageDto: SendMessageDto) {
        const { senderName, recipients, content } = createMessageDto;

        // 1. Enregistrer le message en base
        const message = this.messageRepository.create({
            senderName,
            content,
            recipients: recipients.map(r => typeof r === 'string' ? { phone: r } : r),
            status: MessageStatus.PENDING,
        });

        const savedMessage = await this.messageRepository.save(message);

        // 2. Envoyer via WhatsApp Service
        // Pour l'instant on itère, mais idéalement on utiliserait une queue
        for (const recipient of savedMessage.recipients) {
            const phone = recipient.phone;
            // Add default country code 237 if missing
            let formattedPhone = phone.replace(/\s+/g, '');
            if (!formattedPhone.startsWith('237') && formattedPhone.length === 9) {
                formattedPhone = '237' + formattedPhone;
            }

            try {
                await this.whatsappService.sendToNumber(formattedPhone, content);
            } catch (error) {
                this.logger.error(`Failed to send to ${phone}`, error);
            }
        }

        savedMessage.status = MessageStatus.SENT;
        return this.messageRepository.save(savedMessage);
    }

    async sendFlyer(
        file: Express.Multer.File,
        config: { x: number; y: number; fontSize: number; color: string; previewWidth?: number; previewHeight?: number; fontFamily?: string, qrConfig?: { enabled: boolean, x: number, y: number, size: number } },
        senderName: string,
        recipients: { phone: string; name?: string }[]
    ) {
        // Enregistrer le message parent (type FLYER ou similaire, on utilise Message simple pour l'instant)
        // Lazy import sharp to avoid strict dependency if not installed
        const sharp = require('sharp');
        const fs = require('fs').promises;
        const path = require('path');
        const QRCode = require('qrcode'); // Require qrcode lib

        // Prepare storage folder
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const campaignDirName = `${timestamp}_${senderName.replace(/\s+/g, '_')}`;
        const uploadDir = path.join(process.cwd(), 'uploads', 'flyers', campaignDirName);

        try {
            await fs.mkdir(uploadDir, { recursive: true });
            // Save Original
            await fs.writeFile(path.join(uploadDir, 'template_original.png'), file.buffer);
        } catch (err) {
            this.logger.error('Failed to create upload directory', err);
        }

        const parentMessage = this.messageRepository.create({
            senderName,
            content: `[FLYER] ${file.originalname} (Saved in ${campaignDirName})`,
            recipients: recipients,
            status: MessageStatus.PENDING,
        });
        const savedMessage = await this.messageRepository.save(parentMessage);

        try {
            // Auto-rotate image based on EXIF data
            const pipeline = sharp(file.buffer).rotate();
            const metadata = await pipeline.metadata();
            const width = metadata.width || 1000;
            const height = metadata.height || 1000;

            // Calculate scaling factors
            // Default to 1 if no preview dimensions provided (backward compatibility)
            // let scaleX = 1; // Unused variable
            // let scaleY = 1; // Unused variable

            // Re-normalize buffer for consistent processing
            const { data: normalizedBuffer } = await sharp(file.buffer).rotate().toBuffer({ resolveWithObject: true });

            const { loadImage } = require('canvas');
            const bgImage = await loadImage(normalizedBuffer);

            for (const recipient of recipients) {
                const nameToPrint = recipient.name || '';
                const phone = recipient.phone;

                // 1. Create Invitation
                const invitation = this.invitationRepository.create({
                    recipientName: nameToPrint,
                    recipientPhone: phone,
                    messageId: savedMessage.id,
                });
                const savedInvitation = await this.invitationRepository.save(invitation);

                // 2. Generate QR Code Buffer if enabled
                let qrBuffer: Buffer | null = null;
                if (config.qrConfig?.enabled) {
                    const verifyUrl = `${process.env.APP_URL || 'https://campagne.hellodiffusion.online'}/verify/${savedInvitation.id}`;
                    qrBuffer = await QRCode.toBuffer(verifyUrl, { width: 500 }); // Generate high-res for downscaling
                }

                // Draw using helper
                const outputBuffer = await this.drawFlyerOnCanvas(bgImage, width, height, config, nameToPrint, qrBuffer);

                // Save generated file
                try {
                    await fs.writeFile(path.join(uploadDir, `${phone}.png`), outputBuffer);
                } catch (writeErr) {
                    this.logger.error(`Failed to save flyer for ${phone}`, writeErr);
                }

                // 2. Envoyer l'image via WhatsApp
                const caption = `Bonjour ${nameToPrint}, voici votre invitation !`;

                // Add default country code 237 if missing
                let formattedPhone = phone.replace(/\s+/g, '');
                if (!formattedPhone.startsWith('237') && formattedPhone.length === 9) {
                    formattedPhone = '237' + formattedPhone;
                }

                await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));

                try {
                    await this.whatsappService.sendImageExperimental(formattedPhone, outputBuffer, caption);
                } catch (e) {
                    this.logger.error(`Failed to send flyer to ${phone}`, e);
                }
            }

            savedMessage.status = MessageStatus.SENT;
            await this.messageRepository.save(savedMessage);
            return { status: 'success', count: recipients.length, storagePath: uploadDir };

        } catch (error) {
            this.logger.error('Error sending flyers', error);
            const parentMessage = await this.messageRepository.findOne({ where: { senderName, status: MessageStatus.PENDING }, order: { createdAt: 'DESC' } });
            if (parentMessage) {
                parentMessage.status = MessageStatus.FAILED;
                await this.messageRepository.save(parentMessage);
            }
            throw error;
        }
    }

    async previewFlyer(file: Express.Multer.File, config: any): Promise<Buffer> {
        this.logger.debug(`[Preview] Generating flyer preview. Config: ${JSON.stringify(config)}`);

        // Lazy load sharp
        const sharp = require('sharp');
        const { data: normalizedBuffer, info } = await sharp(file.buffer).rotate().toBuffer({ resolveWithObject: true });
        const width = info.width;
        const height = info.height;

        const { loadImage } = require('canvas');
        const image = await loadImage(normalizedBuffer);

        // Generate Dummy QR if enabled
        let qrBuffer: Buffer | null = null;

        // Fix potential string/boolean mismatch
        const isQrEnabled = config.qrConfig?.enabled === true || config.qrConfig?.enabled === 'true';

        if (isQrEnabled) {
            this.logger.debug(`[Preview] QR Code is enabled. Generating dummy buffer...`);
            try {
                const QRCode = require('qrcode');
                qrBuffer = await QRCode.toBuffer('https://example.com/verify/SAMPLE', { width: 500 });
                this.logger.debug(`[Preview] Dummy QR buffer generated. Size: ${qrBuffer?.length}`);
            } catch (err) {
                this.logger.error(`[Preview] Failed to generate dummy QR`, err);
            }
        } else {
            this.logger.debug(`[Preview] QR Code is DISABLED in config.`);
        }

        return this.drawFlyerOnCanvas(image, width, height, config, "Hello World", qrBuffer);
    }

    // Helper to draw the flyer (Synchronous canvas ops)
    private async drawFlyerOnCanvas(bgImage: any, width: number, height: number, config: any, text: string, qrBuffer: Buffer | null = null): Promise<Buffer> {
        const { createCanvas, loadImage } = require('canvas');

        let scaleX = 1;

        if (config.previewWidth && config.previewWidth > 0) {
            scaleX = width / config.previewWidth;
        }

        const finalX = Math.round(config.x * scaleX);
        const finalY = Math.round(config.y * (config.previewHeight && config.previewHeight > 0 ? height / config.previewHeight : 1));
        const finalFontSize = Math.max(10, Math.round(config.fontSize * scaleX));

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Draw background
        ctx.drawImage(bgImage, 0, 0, width, height);

        // Configure Text Font
        const selectedFamily = config.fontFamily || 'sans';
        let fontFamilyStr = '"Noto Sans", "DejaVu Sans", "Ubuntu", sans-serif';

        if (selectedFamily === 'serif') {
            fontFamilyStr = '"DejaVu Serif", "Times New Roman", "P052", serif';
        } else if (selectedFamily === 'mono') {
            fontFamilyStr = '"Ubuntu Mono", "Courier New", "Fira Code", monospace';
        } else if (selectedFamily === 'ubuntu') {
            fontFamilyStr = '"Ubuntu", "Noto Sans", sans-serif';
        }

        ctx.fillStyle = config.color;
        ctx.font = `bold ${finalFontSize}px ${fontFamilyStr}`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';

        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;

        // Draw Text
        ctx.fillText(text, finalX, finalY);

        // Draw QR Code if provided
        const isQrEnabled = config.qrConfig?.enabled === true || config.qrConfig?.enabled === 'true';
        if (qrBuffer && isQrEnabled) {
            this.logger.debug(`[Canvas] Drawing QR Code...`);
            const qrImage = await loadImage(qrBuffer);

            const qrScaleX = scaleX;
            const qrX = Math.round(config.qrConfig.x * qrScaleX);
            // Assuming config.previewHeight matches canvas aspect or is provided
            const qrScaleY = (config.previewHeight && config.previewHeight > 0 ? height / config.previewHeight : 1);
            const qrY = Math.round(config.qrConfig.y * qrScaleY);

            // Size also needs scaling
            const qrSize = Math.round(config.qrConfig.size * qrScaleX);

            this.logger.debug(`[Canvas] QR Coords: X=${qrX}, Y=${qrY}, Size=${qrSize} (Original: x=${config.qrConfig.x}, y=${config.qrConfig.y}, size=${config.qrConfig.size})`);

            ctx.shadowColor = "transparent"; // Reset shadow for QR
            ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
        } else {
            this.logger.debug(`[Canvas] Skipping QR Draw. Buffer present: ${!!qrBuffer}, Enabled: ${isQrEnabled}`);
        }

        return canvas.toBuffer('image/png');
    }

    async getStats() {
        const messages = await this.messageRepository.find({
            order: { createdAt: 'ASC' }
        });

        // 1. Counters
        let totalMessages = 0;
        let totalCampaigns = 0;
        let totalInvitations = 0;

        // 2. Chart Data (Group by Day)
        const dailyActivity: Record<string, { date: string, messages: number, flyers: number }> = {};

        for (const msg of messages) {
            const isFlyer = msg.content.startsWith('[FLYER]');
            const dateKey = msg.createdAt.toISOString().split('T')[0]; // YYYY-MM-DD

            // Initialize daily entry
            if (!dailyActivity[dateKey]) {
                dailyActivity[dateKey] = { date: dateKey, messages: 0, flyers: 0 };
            }

            if (isFlyer) {
                totalCampaigns++;
                totalInvitations += Array.isArray(msg.recipients) ? msg.recipients.length : 0;
                dailyActivity[dateKey].flyers++;
            } else {
                totalMessages++;
                dailyActivity[dateKey].messages++;
            }
        }

        // Convert chart data to array
        const chartData = Object.values(dailyActivity);

        return {
            counters: {
                totalMessages,
                totalCampaigns,
                totalInvitations
            },
            chartData
        };
    }

    findAll() {
        return this.messageRepository.find({
            order: { createdAt: 'DESC' }
        });
    }
}
