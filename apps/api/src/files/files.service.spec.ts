import { DocumentCustomerEmailsService } from '../document-emails/document-customer-emails.service';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from './files.service';

describe('FilesService categories', () => {
  const service = new FilesService(
    {} as PrismaService,
    {} as DocumentCustomerEmailsService,
  );

  it('acepta la categoría de guías de movilidad para activos', () => {
    expect(service.getCategories('ASSET')).toContainEqual({
      value: 'GUIA_MOVILIDAD',
      label: 'Guia Movilidad',
    });
  });

  it('acepta la categoría de guías para proveedores', () => {
    expect(service.getCategories('WAREHOUSE')).toContainEqual({
      value: 'GUIA_MOVILIDAD_PROVEEDOR',
      label: 'Guia Movilidad Proveedor',
    });
  });

  it('devuelve en español los errores de categorías inválidas', () => {
    expect(() => service.getCategories('TIPO_DESCONOCIDO')).toThrow(
      'El tipo de entidad del archivo no es válido',
    );
  });
});
