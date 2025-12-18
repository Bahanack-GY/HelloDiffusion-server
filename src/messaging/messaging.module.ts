import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { Message } from './entities/message.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Message])],
    controllers: [MessagingController],
    providers: [MessagingService],
})
export class MessagingModule { }
