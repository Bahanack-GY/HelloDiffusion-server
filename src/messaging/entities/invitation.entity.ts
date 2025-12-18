import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

export enum InvitationStatus {
    SENT = 'SENT',
    SCANNED = 'SCANNED',
    VERIFIED = 'VERIFIED'
}

@Entity()
export class Invitation {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    recipientName: string;

    @Column()
    recipientPhone: string;

    @Column({
        type: 'enum',
        enum: InvitationStatus,
        default: InvitationStatus.SENT
    })
    status: InvitationStatus;

    // Optional link to parent message/campaign
    @Column({ nullable: true })
    messageId: string;

    @Column({ type: 'timestamp', nullable: true })
    scannedAt: Date;

    @CreateDateColumn()
    createdAt: Date;
}
