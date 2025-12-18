import { Controller, Get, Post, Body, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express'; // Need for Express.Multer.File type
import { MessagingService } from './messaging.service';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('messaging')
export class MessagingController {
    constructor(private readonly messagingService: MessagingService) { }

    @Post('send')
    send(@Body() sendMessageDto: SendMessageDto) {
        return this.messagingService.send(sendMessageDto);
    }

    @Get('history')
    findAll() {
        return this.messagingService.findAll();
    }
    @Post('send-flyer')
    @UseInterceptors(FileInterceptor('file'))
    async sendFlyer(
        @UploadedFile() file: any,
        @Body('config') configString: string,
        @Body('senderName') senderName: string,
        @Body('recipients') recipientsString: string,
    ) {
        // Parse config and recipients manually since they come as strings in multipart/form-data
        const config = JSON.parse(configString);
        const recipients = JSON.parse(recipientsString);

        return this.messagingService.sendFlyer(file, config, senderName, recipients);
    }

    @Post('preview-flyer')
    @UseInterceptors(FileInterceptor('file'))
    async previewFlyer(
        @UploadedFile() file: any,
        @Body('config') configString: string
    ) {
        const config = JSON.parse(configString);
        const buffer = await this.messagingService.previewFlyer(file, config);

        // We need to return the buffer as an image stream
        // In NestJS we can format the response, but easiest is to return StreamableFile 
        // or just set headers in logic. For simplicity, I'll return a Base64 string for frontend to display easily.
        // Actually, returning Base64 { image: "data:..." } is easiest for JSON APIs.
        return {
            image: `data:image/png;base64,${buffer.toString('base64')}`
        };
    }
}
