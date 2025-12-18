import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

export enum MessageStatus {
    PENDING = 'PENDING',
    SENT = 'SENT',
    FAILED = 'FAILED',
}

@Entity()
export class Message {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    senderName: string;

    @Column('text')
    content: string;

    @Column('jsonb')
    recipients: any[];

    @Column({
        type: 'enum',
        enum: MessageStatus,
        default: MessageStatus.PENDING,
    })
    status: MessageStatus;

    @CreateDateColumn()
    createdAt: Date;
}
