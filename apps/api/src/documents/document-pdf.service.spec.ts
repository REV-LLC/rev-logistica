import sharp from 'sharp';
import { DocumentPdfService } from './document-pdf.service';

describe('DocumentPdfService', () => {
  const document = {
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
    items: [
      {
        quantity: 2,
        requestedTag: null,
        conditionNote: null,
        sku: { name: 'Andamio certificado' },
        asset: null,
      },
    ],
  };

  function pageCount(buffer: Buffer) {
    return buffer.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;
  }

  async function imageDataUrl(options: {
    width: number;
    height: number;
    background: string;
  }) {
    const image = await sharp({
      create: {
        width: options.width,
        height: options.height,
        channels: 4,
        background: options.background,
      },
    })
      .png()
      .toBuffer();
    return `data:image/png;base64,${image.toString('base64')}`;
  }

  it('renders a valid one-page PDF customer copy without a blank trailing page', async () => {
    const service = new DocumentPdfService();
    const buffer = await service.render(document);

    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(1_000);
    expect(pageCount(buffer)).toBe(1);
    expect(
      service.fileName({
        type: 'REMISSION',
        consecutive: 'RM000001',
      }),
    ).toBe('remision-RM000001.pdf');
  });

  it('embeds the received signature and photographic evidence', async () => {
    const service = new DocumentPdfService();
    const signature = await imageDataUrl({
      width: 420,
      height: 140,
      background: '#1d4ed8',
    });
    const evidence = await imageDataUrl({
      width: 1200,
      height: 800,
      background: '#f59e0b',
    });
    const buffer = await service.render({
      ...document,
      files: [
        {
          fileType: 'SIGNATURE_RECEIVED',
          displayName: 'Firma de recibido',
          originalName: 'firma.png',
          storageKey: signature,
          mimeType: 'image/png',
        },
        {
          fileType: 'PHOTO_EVIDENCE',
          displayName: 'Equipo entregado',
          originalName: 'evidencia.png',
          storageKey: evidence,
          mimeType: 'image/png',
        },
      ],
    });

    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(5_000);
    expect(pageCount(buffer)).toBe(2);
  });
});
