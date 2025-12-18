import { Module, Global } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';

@Global() // Rendre global pour l'utiliser facilement dans MessagingModule sans réimporter partout
@Module({
    controllers: [WhatsappController],
    providers: [WhatsappService],
    exports: [WhatsappService],
})
export class WhatsappModule { }
