import { Controller, Get, Post, Body } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';

@Controller('contacts')
export class ContactsController {
    constructor(private readonly contactsService: ContactsService) { }

    @Post()
    create(@Body() createContactDto: CreateContactDto) {
        return this.contactsService.create(createContactDto);
    }

    @Post('import')
    import(@Body() contacts: CreateContactDto[]) {
        return this.contactsService.createMany(contacts);
    }

    @Get()
    findAll() {
        return this.contactsService.findAll();
    }
}
