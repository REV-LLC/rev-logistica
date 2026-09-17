import { ForbiddenException } from '@nestjs/common';
import { DocumentType, Role } from '@prisma/client';
import { DocumentsService } from './documents.service';
import * as tabletAccess from '../auth/tablet-access';

describe('warehouse tablet cannot bypass employee identification', () => {
  const service = new DocumentsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const requester = { sub: 'tablet', role: Role.WAREHOUSE_TABLET };
  it.each(['create', 'autosave', 'update'])(
    'rejects per-item origins outside the tablet warehouse on %s', async route => {
      const access = jest.spyOn(tabletAccess, 'resolveTabletDocumentAccess').mockResolvedValue({
        warehouseId: 'assigned', performedByEmployeeId: 'employee', performedByEmployeeName: 'QA', tabletAuthorizationId: 'grant',
      });
      const payload = { type: DocumentType.REMISSION, warehouseId: 'assigned', tabletEmployeeToken: 'QA',
        items: [{ requestedTag: 'QA', ownerWarehouseId: 'provider', sourceWarehouseId: 'another-warehouse' }] };
      try {
        const result = route === 'create'
          ? service.createRequestDocument({ ...payload, createdBy: 'tablet', requesterRole: requester.role })
          : route === 'autosave'
            ? service.createAutosavedRequestDocument({ ...payload, createdBy: 'tablet', requesterRole: requester.role })
            : service.updateAutosavedRequestDocument('doc', payload, requester);
        await expect(result).rejects.toThrow('bodega asignada');
      } finally { access.mockRestore(); }
    });
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
