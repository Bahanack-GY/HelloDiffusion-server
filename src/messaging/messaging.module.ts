import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { InvitationsController } from './invitations.controller';
import { Message } from './entities/message.entity';
import { Invitation } from './entities/invitation.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Message, Invitation])],
    controllers: [MessagingController, InvitationsController],
    providers: [MessagingService],
})
export class MessagingModule { }
