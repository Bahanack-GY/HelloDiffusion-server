import { Module, Global } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

@Global() // Rendre global pour l'utiliser facilement dans MessagingModule sans réimporter partout
@Module({
    providers: [WhatsappService],
    exports: [WhatsappService],
})
export class WhatsappModule { }
