import { ForbiddenException } from '@nestjs/common';
import { DocumentType, Role } from '@prisma/client';
import { DocumentsService } from './documents.service';

describe('warehouse tablet cannot bypass employee identification', () => {
  const service = new DocumentsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const requester = { sub: 'tablet', role: Role.WAREHOUSE_TABLET };
  it('blocks direct creation without a PIN authorization', async () => {
    await expect(
      service.createRequestDocument({
        type: 'REMISSION',
        createdBy: 'tablet',
        requesterRole: requester.role,
        items: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('blocks creating an autosaved draft without a PIN authorization', async () => {
    await expect(
      service.createAutosavedRequestDocument({
        type: DocumentType.RETURN,
        createdBy: 'tablet',
        requesterRole: requester.role,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('blocks updating a draft without a PIN authorization', async () => {
    await expect(
      service.updateAutosavedRequestDocument(
        'doc',
        { type: DocumentType.RETURN },
        requester,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('blocks submitting a draft without a PIN authorization', async () => {
    await expect(
      service.submitAutosavedRequestDocument('doc', {}, requester),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
