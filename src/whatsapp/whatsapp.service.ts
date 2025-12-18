import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    AuthenticationState,
    makeCacheableSignalKeyStore,
    WASocket,
} from '@whiskeysockets/baileys';
import * as qrcode from 'qrcode-terminal';
import { pino } from 'pino';

@Injectable()
export class WhatsappService implements OnModuleInit {
    private socket: WASocket;
    private state: AuthenticationState;
    private saveCreds: () => Promise<void>;
    private readonly logger = new Logger(WhatsappService.name);
    private qrCode: string | null = null;
    private connectionStatus: 'open' | 'connecting' | 'close' = 'connecting';

    async onModuleInit() {
        await this.connectToWhatsapp();
    }

    private async connectToWhatsapp() {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        this.state = state;
        this.saveCreds = saveCreds;

        this.socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
            },
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }) as any,
            browser: ['Hello-Difusion', 'Chrome', '1.0.0'],
        });

        this.socket.ev.on('creds.update', saveCreds);

        this.socket.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                this.qrCode = qr;
                this.connectionStatus = 'connecting';
                // qrcode.generate(qr, { small: true }); // debug terminal only
                this.logger.log('QR Code updated');
            }

            if (connection === 'close') {
                this.connectionStatus = 'close';
                this.qrCode = null; // Clear QR on close/disconnect usually, or keep it if reconnecting?
                // Actually if closed, we might need new QR if we reconnect.

                const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
                this.logger.warn(`Connection closed due to ${lastDisconnect?.error}, reconnecting: ${shouldReconnect}`);

                if (shouldReconnect) {
                    this.connectToWhatsapp();
                } else {
                    this.logger.error('Connection closed. You are logged out. Cleaning up and restarting...');
                    this.connectionStatus = 'connecting';

                    // Clean up invalid session
                    const fs = require('fs');
                    try {
                        fs.rmSync('auth_info_baileys', { recursive: true, force: true });
                    } catch (e) {
                        this.logger.error('Failed to clear auth folder', e);
                    }

                    // Restart to generate new QR
                    this.connectToWhatsapp();
                }
            } else if (connection === 'open') {
                this.connectionStatus = 'open';
                this.qrCode = null; // Clear QR once connected
                this.logger.log('Opened connection to WhatsApp!');
            }
        });
    }

    getStatus() {
        return {
            status: this.connectionStatus,
            qrCode: this.qrCode
        };
    }

    async logout() {
        if (this.socket) {
            await this.socket.logout();
            this.connectionStatus = 'close';
            this.qrCode = null;
            // Clean up auth info? Baileys usually handles logout by clearing creds on 'loggedOut' event logic if implemented
            // But we might need to physically delete the folder if we want fresh start
            const fs = require('fs');
            try {
                fs.rmSync('auth_info_baileys', { recursive: true, force: true });
            } catch (e) {
                this.logger.error('Failed to clear auth folder', e);
            }
            // Trigger customized reconnect to generate new QR for new login
            this.connectToWhatsapp();
        }
    }

    private async formatAndDelay(phone: string): Promise<string> {
        if (!this.socket) throw new Error('WhatsApp socket not initialized');

        // Formater le numéro
        let cleanedPhone = phone.replace(/[^0-9]/g, '');

        // Si le numéro fait 9 chiffres (format Cameroun standard sans indicatif), ajouter 237
        if (cleanedPhone.length === 9) {
            cleanedPhone = '237' + cleanedPhone;
        }

        const formattedPhone = cleanedPhone + '@s.whatsapp.net';

        // 1. Simulation: "Presence Update" (En train d'écrire...)
        await this.socket.sendPresenceUpdate('composing', formattedPhone);

        // 2. Délai aléatoire (Throttling) pour simuler un humain (2-5 secondes)
        const delay = Math.floor(Math.random() * 3000) + 2000;
        await new Promise(resolve => setTimeout(resolve, delay));

        // 3. Pause "Presence" avant envoi
        await this.socket.sendPresenceUpdate('paused', formattedPhone);

        return formattedPhone;
    }

    async sendToNumber(phone: string, text: string) {
        const formattedPhone = await this.formatAndDelay(phone);
        // 4. Envoi réel
        const sent = await this.socket.sendMessage(formattedPhone, { text });
        return sent;
    }

    async sendImageExperimental(phone: string, imageBuffer: Buffer, caption: string) {
        const formattedPhone = await this.formatAndDelay(phone);
        const sent = await this.socket.sendMessage(formattedPhone, {
            image: imageBuffer,
            caption: caption,
        });
        return sent;
    }
}
