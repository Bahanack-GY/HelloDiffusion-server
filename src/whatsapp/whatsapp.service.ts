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
            printQRInTerminal: false, // Option deprecated, géré manuellement ci-dessous
            logger: pino({ level: 'silent' }) as any, // Réduit le bruit des logs de Baileys
            browser: ['Hello-Difusion', 'Chrome', '1.0.0'], // Nom du client qui apparaît
        });

        this.socket.ev.on('creds.update', saveCreds);

        this.socket.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                qrcode.generate(qr, { small: true });
                this.logger.log('Scan the QR code above to connect.');
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
                this.logger.warn(`Connection closed due to ${lastDisconnect?.error}, reconnecting: ${shouldReconnect}`);
                if (shouldReconnect) {
                    this.connectToWhatsapp();
                } else {
                    this.logger.error('Connection closed. You are logged out.');
                    // Gérer ici le nettoyage si nécessaire
                }
            } else if (connection === 'open') {
                this.logger.log('Opened connection to WhatsApp!');
            }
        });
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
