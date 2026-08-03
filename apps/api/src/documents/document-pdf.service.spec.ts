import { DocumentPdfService } from './document-pdf.service';

describe('DocumentPdfService', () => {
  it('renders a valid PDF customer copy', async () => {
    const service = new DocumentPdfService();
    const buffer = await service.render({
      type: 'REMISSION',
      status: 'DRAFT',
      consecutive: 'RM000001',
      docDate: new Date('2026-08-03T12:00:00.000Z'),
      notes: 'Entregar en portería.',
      customerWorksite: {
        alias: 'Obra Centro',
        customer: { name: 'Cliente Ejemplo' },
        worksite: { name: 'Proyecto Centro', address: 'Calle 1 # 2-3' },
      },
      items: [{
        quantity: 2,
        requestedTag: null,
        conditionNote: null,
        sku: { name: 'Andamio certificado' },
        asset: null,
      }],
    });

    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(1_000);
    expect(service.fileName({
      type: 'REMISSION',
      consecutive: 'RM000001',
    })).toBe('remision-RM000001.pdf');
  });
});
