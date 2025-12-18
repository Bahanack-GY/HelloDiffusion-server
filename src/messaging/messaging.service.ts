import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message, MessageStatus } from './entities/message.entity';
import { SendMessageDto } from './dto/send-message.dto';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class MessagingService {
    private readonly logger = new Logger(MessagingService.name);

    constructor(
        @InjectRepository(Message)
        private messageRepository: Repository<Message>,
        private whatsappService: WhatsappService,
    ) { }

    async send(sendMessageDto: SendMessageDto) {
        const message = this.messageRepository.create({
            ...sendMessageDto,
            status: MessageStatus.PENDING,
            recipients: sendMessageDto.recipients as any[], // Cast explicite pour éviter les conflits de type
        });
        const savedMessage = await this.messageRepository.save(message);

        // 2. Envoyer aux destinataires (en arrière-plan ou ici directement)
        // Pour une implémentation simple, on le fait ici séquentiellement
        this.processSending(savedMessage);

        return savedMessage;
    }

    private async processSending(message: Message) {
        try {
            for (const recipientItem of message.recipients) {
                let recipientNumber: string;
                let recipientName: string | undefined;

                if (typeof recipientItem === 'string') {
                    recipientNumber = recipientItem;
                    recipientName = '';
                } else {
                    recipientNumber = recipientItem.phone;
                    recipientName = recipientItem.name;
                }

                // Personnalisation du message
                // Remplace ${nom}, ${name}, ${Nom} par le nom du destinataire
                let personalizedContent = message.content;
                if (recipientName) {
                    personalizedContent = personalizedContent.replace(/\$\{(nom|name|Nom)\}/g, recipientName);
                } else {
                    // Si pas de nom, on remplace par vide ou une valeur par défaut générique si on voulait
                    personalizedContent = personalizedContent.replace(/\$\{(nom|name|Nom)\}/g, '');
                }

                // Nettoyage des doubles espaces potentiels créés
                personalizedContent = personalizedContent.replace(/  +/g, ' ');

                try {
                    await this.whatsappService.sendToNumber(recipientNumber, personalizedContent);
                    this.logger.log(`Sent to ${recipientNumber}`);
                } catch (err) {
                    this.logger.error(`Failed to send to ${recipientNumber}`, err);
                    // On pourrait marquer des échecs partiels ici
                }
            }

            // Mettre à jour le statut final
            message.status = MessageStatus.SENT;
            await this.messageRepository.save(message);
        } catch (error) {
            this.logger.error('Error during bulk sending', error);
            message.status = MessageStatus.FAILED;
            await this.messageRepository.save(message);
        }
    }

    async sendFlyer(
        file: Express.Multer.File,
        config: { x: number; y: number; fontSize: number; color: string; previewWidth?: number; previewHeight?: number; fontFamily?: string },
        senderName: string,
        recipients: { phone: string; name?: string }[]
    ) {
        // Enregistrer le message parent (type FLYER ou similaire, on utilise Message simple pour l'instant)
        // Lazy import sharp to avoid strict dependency if not installed
        const sharp = require('sharp');
        const fs = require('fs').promises;
        const path = require('path');

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
            let scaleX = 1;
            let scaleY = 1;

            if (config.previewWidth && config.previewWidth > 0) {
                scaleX = width / config.previewWidth;
            }
            if (config.previewHeight && config.previewHeight > 0) {
                scaleY = height / config.previewHeight;
            }

            // Re-normalize buffer for consistent processing
            const { data: normalizedBuffer } = await sharp(file.buffer).rotate().toBuffer({ resolveWithObject: true });

            const { createCanvas, loadImage } = require('canvas');
            const bgImage = await loadImage(normalizedBuffer);

            for (const recipient of recipients) {
                const nameToPrint = recipient.name || '';
                const phone = recipient.phone;

                // Draw using helper
                const outputBuffer = this.drawFlyerOnCanvas(bgImage, width, height, config, nameToPrint);

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

    // Helper to draw the flyer (Synchronous canvas ops)
    private drawFlyerOnCanvas(bgImage: any, width: number, height: number, config: any, text: string): Buffer {
        const { createCanvas } = require('canvas');

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

        return canvas.toBuffer('image/png');
    }

    // New Preview Method
    async previewFlyer(file: Express.Multer.File, config: any): Promise<Buffer> {
        // Lazy load sharp
        const sharp = require('sharp');
        const { data: normalizedBuffer, info } = await sharp(file.buffer).rotate().toBuffer({ resolveWithObject: true });
        const width = info.width;
        const height = info.height;

        const { loadImage } = require('canvas');
        const image = await loadImage(normalizedBuffer);

        return this.drawFlyerOnCanvas(image, width, height, config, "Hello World");
    }

    findAll() {
        return this.messageRepository.find({
            order: { createdAt: 'DESC' }
        });
    }
}
