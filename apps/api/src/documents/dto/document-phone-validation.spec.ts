import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DocumentType } from '@prisma/client';
import { CreateDocumentRequestDto } from './create-document-request.dto';

describe('Document phone DTO validation', () => {
  async function recipientPhoneErrors(phone: string) {
    const payload = plainToInstance(CreateDocumentRequestDto, {
      type: DocumentType.REMISSION,
      recipientPhones: [phone],
      items: [{ requestedTag: 'Ítem de prueba' }],
    });
    const errors = await validate(payload);
    return errors.filter((error) => error.property === 'recipientPhones');
  }

  it.each(['3001234567', '+573001234567', '+57 300 123 4567'])(
    'accepts a valid Colombian number from the request form: %s',
    async (phone) => {
      await expect(recipientPhoneErrors(phone)).resolves.toHaveLength(0);
    },
  );

  it.each(['300123456', '+58 3001234567', 'abc 3001234567'])(
    'rejects an invalid request phone: %s',
    async (phone) => {
      await expect(recipientPhoneErrors(phone)).resolves.toHaveLength(1);
    },
  );
});
