import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact } from './entities/contact.entity';
import { CreateContactDto } from './dto/create-contact.dto';

@Injectable()
export class ContactsService {
    constructor(
        @InjectRepository(Contact)
        private contactRepository: Repository<Contact>,
    ) { }

    // Créer un seul contact
    create(createContactDto: CreateContactDto) {
        const contact = this.contactRepository.create(createContactDto);
        return this.contactRepository.save(contact);
    }

    // Créer plusieurs contacts ou mettre à jour si le téléphone existe déjà
    async createMany(contacts: CreateContactDto[]) {
        return this.contactRepository.upsert(contacts, ['phone']);
    }

    // Récupérer tous les contacts
    findAll() {
        return this.contactRepository.find();
    }
}
