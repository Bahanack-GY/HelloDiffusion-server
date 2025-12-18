import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invitation, InvitationStatus } from './entities/invitation.entity';

@Controller('invitations')
export class InvitationsController {
    constructor(
        @InjectRepository(Invitation)
        private invitationRepository: Repository<Invitation>,
    ) { }

    @Get(':id/verify')
    async verify(@Param('id') id: string) {
        const invitation = await this.invitationRepository.findOneBy({ id });

        if (!invitation) {
            throw new NotFoundException('Invitation not found');
        }

        // Logic: confirm scan if not already confirmed, or just return status
        if (invitation.status === InvitationStatus.SENT) {
            invitation.status = InvitationStatus.SCANNED;
            invitation.scannedAt = new Date();
            await this.invitationRepository.save(invitation);
        }

        return {
            valid: true,
            invitation: {
                id: invitation.id,
                recipientName: invitation.recipientName,
                status: invitation.status,
                scannedAt: invitation.scannedAt
            }
        };
    }
}
