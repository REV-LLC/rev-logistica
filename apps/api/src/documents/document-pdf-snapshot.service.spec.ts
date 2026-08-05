import { DocumentPdfSnapshotService } from './document-pdf-snapshot.service';

describe('DocumentPdfSnapshotService', () => {
  it('reuses the stored PDF without rendering it again', async () => {
    const stored = {
      id: 'pdf-1',
      documentId: 'document-1',
      storageKey: 'https://files.test/document-1.pdf',
      objectKey: 'document/document-1/generated-pdf/pdf-1.pdf',
      originalName: 'remision-RM000001.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
    };
    const prisma = {
      fileObject: {
        findFirst: jest.fn().mockResolvedValue(stored),
      },
    };
    const pdf = {
      render: jest.fn(),
    };
    const service = new DocumentPdfSnapshotService(
      prisma as never,
      pdf as never,
    );

    await expect(service.getOrCreate('document-1')).resolves.toEqual(stored);
    expect(pdf.render).not.toHaveBeenCalled();
  });
});
