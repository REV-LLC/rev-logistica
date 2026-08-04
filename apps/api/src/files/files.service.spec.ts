import { ForbiddenException } from '@nestjs/common';
import { DocumentStatus, DocumentType, Role } from '@prisma/client';
import { FilesService } from './files.service';

describe('FilesService document access', () => {
  const documentFindUnique = jest.fn();
  const service = new FilesService(
    { document: { findUnique: documentFindUnique } } as never,
    {} as never,
  );
  const assertEntityAccess = (
    userId: string,
    mode: 'read' | 'write',
  ) =>
    (
      service as unknown as {
        assertEntityAccess: (
          entityType: string,
          entityId: string,
          user: { id: string; role: Role },
          mode: 'read' | 'write',
        ) => Promise<void>;
      }
    ).assertEntityAccess(
      'DOCUMENT',
      'document-1',
      { id: userId, role: Role.DRIVER },
      mode,
    );

  beforeEach(() => {
    documentFindUnique.mockReset();
  });

  it('allows a driver to append files to their own draft', async () => {
    documentFindUnique.mockResolvedValue({
      id: 'document-1',
      type: DocumentType.REMISSION,
      status: DocumentStatus.DRAFT,
      createdBy: 'driver-1',
    });

    await expect(assertEntityAccess('driver-1', 'write')).resolves.toBeUndefined();
  });

  it('rejects writes to another driver document', async () => {
    documentFindUnique.mockResolvedValue({
      id: 'document-1',
      type: DocumentType.REMISSION,
      status: DocumentStatus.DRAFT,
      createdBy: 'driver-2',
    });

    await expect(assertEntityAccess('driver-1', 'write')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects driver writes after the document leaves draft status', async () => {
    documentFindUnique.mockResolvedValue({
      id: 'document-1',
      type: DocumentType.RETURN,
      status: DocumentStatus.CONFIRMED,
      createdBy: 'driver-1',
    });

    await expect(assertEntityAccess('driver-1', 'write')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
