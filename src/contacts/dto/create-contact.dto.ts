import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateContactDto {
    @IsString()
    @IsNotEmpty()
    phone: string;

    @IsString()
    @IsOptional()
    name?: string;

    @IsOptional()
    metadata?: Record<string, any>;
}
