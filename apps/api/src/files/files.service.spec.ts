import { ForbiddenException } from '@nestjs/common';
import {
  DocumentStatus,
  DocumentType,
  Role,
  WarehouseType,
} from '@prisma/client';
import { DocumentCustomerEmailsService } from '../document-emails/document-customer-emails.service';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from './files.service';
import sharp from 'sharp';

describe('FilesService categories', () => {
  const service = new FilesService(
    {} as PrismaService,
    {} as DocumentCustomerEmailsService,
    {} as never,
  );

  it('acepta la categoría de guías de movilidad para activos', () => {
    expect(service.getCategories('ASSET')).toContainEqual({
      value: 'GUIA_MOVILIDAD',
      label: 'Guia Movilidad',
    });
  });

  it('acepta la tarjeta de propiedad como documento de activos', () => {
    expect(service.getCategories('ASSET')).toContainEqual({
      value: 'TARJETA_PROPIEDAD',
      label: 'Tarjeta Propiedad',
    });
  });

  it('no ofrece evidencia de horómetro como documento general del activo', () => {
    expect(service.getCategories('ASSET')).not.toContainEqual(
      expect.objectContaining({ value: 'EVIDENCIA_HOROMETRO' }),
    );
  });

  it('acepta la categoría de guías para proveedores', () => {
    expect(service.getCategories('WAREHOUSE')).toContainEqual({
      value: 'GUIA_MOVILIDAD_PROVEEDOR',
      label: 'Guia Movilidad Proveedor',
    });
  });

  it('separa evidencia y comprobante de recepción del proveedor', () => {
    expect(service.getCategories('DOCUMENT')).toEqual(
      expect.arrayContaining([
        {
          value: 'EVIDENCIA_ENTREGA_PROVEEDOR',
          label: 'Evidencia Entrega Proveedor',
        },
        {
          value: 'COMPROBANTE_RECEPCION_PROVEEDOR',
          label: 'Comprobante Recepcion Proveedor',
        },
        {
          value: 'COMPROBANTE_SALIDA_PROVEEDOR',
          label: 'Comprobante Salida Proveedor',
        },
      ]),
    );
  });

  it('devuelve en español los errores de categorías inválidas', () => {
    expect(() => service.getCategories('TIPO_DESCONOCIDO')).toThrow(
      'El tipo de entidad del archivo no es válido',
    );
  });
});

describe('FilesService image thumbnails', () => {
  const service = new FilesService({} as never, {} as never, {} as never);
  const createThumbnail = (buffer: Buffer) =>
    (
      service as unknown as {
        createImageThumbnail: (value: Buffer) => Promise<Buffer>;
      }
    ).createImageThumbnail(buffer);

  it('creates a small preview without replacing the original photo', async () => {
    const buffer = await sharp({
      create: {
        width: 3000,
        height: 2400,
        channels: 3,
        background: { r: 120, g: 80, b: 40 },
      },
    })
      .png()
      .toBuffer();

    const thumbnail = await createThumbnail(buffer);
    const metadata = await sharp(thumbnail).metadata();

    expect(thumbnail.length).toBeLessThan(buffer.length);
    expect(metadata.format).toBe('webp');
    expect(
      Math.max(metadata.width ?? 0, metadata.height ?? 0),
    ).toBeLessThanOrEqual(480);
  });
});

describe('FilesService asset documents', () => {
  const assetFindUnique = jest.fn();
  const hourReadingFindMany = jest.fn();
  const fileFindMany = jest.fn();
  const service = new FilesService(
    {
      asset: { findUnique: assetFindUnique },
      assetHourReading: { findMany: hourReadingFindMany },
      fileObject: { findMany: fileFindMany },
    } as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    assetFindUnique.mockReset().mockResolvedValue({ id: 'asset-1' });
    hourReadingFindMany
      .mockReset()
      .mockResolvedValue([{ evidenceFileObjectId: 'hour-evidence-1' }]);
    fileFindMany.mockReset().mockResolvedValue([]);
  });

  it('excluye las evidencias de horómetro del listado de documentos', async () => {
    await service.listEntityFiles('ASSET', 'asset-1', {
      id: 'admin-1',
      role: Role.ADMIN,
    });

    expect(fileFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityType: 'ASSET',
          entityId: 'asset-1',
          fileType: {
            notIn: ['GENERATED_DOCUMENT_PDF', 'EVIDENCIA_HOROMETRO'],
          },
          id: { notIn: ['hour-evidence-1'] },
          OR: [
            { category: null },
            { category: { not: 'EVIDENCIA_HOROMETRO' } },
          ],
        }),
      }),
    );
  });
});

describe('FilesService provider remission links', () => {
  const warehouseFindUnique = jest.fn();
  const fileFindMany = jest.fn();
  const service = new FilesService(
    {
      warehouse: { findUnique: warehouseFindUnique },
      fileObject: { findMany: fileFindMany },
    } as never,
    {} as never,
    {} as never,
  );
  const resolveProviderWarehouseId = (value?: string) =>
    (
      service as unknown as {
        resolveProviderWarehouseId: (
          category: string,
          value?: string,
        ) => Promise<string | null>;
      }
    ).resolveProviderWarehouseId('COMPROBANTE_SALIDA_PROVEEDOR', value);

  beforeEach(() => {
    warehouseFindUnique.mockReset();
    fileFindMany.mockReset();
  });

  it('requires a provider for a physical provider remission', async () => {
    await expect(resolveProviderWarehouseId()).rejects.toThrow(
      'La remisión física debe estar asociada a un proveedor',
    );
  });

  it('accepts only ALLY warehouses as providers', async () => {
    warehouseFindUnique.mockResolvedValue({
      id: 'warehouse-own',
      type: WarehouseType.OWN,
    });

    await expect(resolveProviderWarehouseId('warehouse-own')).rejects.toThrow(
      'debe ser de tipo ALLY',
    );
  });

  it('lists remissions linked to one provider', async () => {
    warehouseFindUnique.mockResolvedValue({
      id: 'provider-1',
      name: 'Proveedor 1',
      type: WarehouseType.ALLY,
      active: true,
    });
    fileFindMany.mockResolvedValue([{ id: 'file-1' }]);

    await expect(service.listProviderRemissions('provider-1')).resolves.toEqual(
      {
        provider: expect.objectContaining({ id: 'provider-1' }),
        files: [{ id: 'file-1' }],
      },
    );
    expect(fileFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          providerWarehouseId: 'provider-1',
          category: 'COMPROBANTE_SALIDA_PROVEEDOR',
        },
      }),
    );
  });
});

describe('FilesService document access', () => {
  const documentFindUnique = jest.fn();
  const service = new FilesService(
    { document: { findUnique: documentFindUnique } } as never,
    {} as never,
    {} as never,
  );
  const assertEntityAccess = (userId: string, mode: 'read' | 'write') =>
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

    await expect(
      assertEntityAccess('driver-1', 'write'),
    ).resolves.toBeUndefined();
  });

  it('allows a driver to upload both supports to their own provider receipt draft', async () => {
    documentFindUnique.mockResolvedValue({
      id: 'document-1',
      type: DocumentType.PROVIDER_RECEIPT,
      status: DocumentStatus.DRAFT,
      createdBy: 'driver-1',
    });

    await expect(
      assertEntityAccess('driver-1', 'write'),
    ).resolves.toBeUndefined();
  });

  it('rejects writes to another driver document', async () => {
    documentFindUnique.mockResolvedValue({
      id: 'document-1',
      type: DocumentType.REMISSION,
      status: DocumentStatus.DRAFT,
      createdBy: 'driver-2',
    });

    await expect(
      assertEntityAccess('driver-1', 'write'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects driver writes after the document leaves draft status', async () => {
    documentFindUnique.mockResolvedValue({
      id: 'document-1',
      type: DocumentType.RETURN,
      status: DocumentStatus.CONFIRMED,
      createdBy: 'driver-1',
    });

    await expect(
      assertEntityAccess('driver-1', 'write'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
