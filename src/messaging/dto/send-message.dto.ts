import { IsString, IsNotEmpty, IsArray, ArrayMinSize } from 'class-validator';

export class SendMessageDto {
    @IsString()
    @IsNotEmpty()
    senderName: string;

    @IsArray()
    @ArrayMinSize(1)
    recipients: (string | { phone: string; name?: string })[];

    @IsString()
    @IsNotEmpty()
    content: string;
}
