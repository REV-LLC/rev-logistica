import { analyzeCertificate } from './certificate-analysis';
const now = new Date('2026-11-19T15:00:00Z');
const base = {
  kind: 'EPS' as const,
  employee: { name: 'ANA MARIA', lastName: 'PEREZ', documentId: '1234567890' },
  otherDocuments: ['9988776655'],
  providers: [
    { id: 'sanitas', kind: 'EPS', name: 'Sanitas', active: true },
    { id: 'sura', kind: 'EPS', name: 'Sura', active: true },
    { id: 'arl-sura', kind: 'ARL', name: 'Sura', active: true },
  ],
  now,
};
const certificate =
  'EPS SANITAS CERTIFICADO DE AFILIACION. ANA MARIA PEREZ CC 1.234.567.890. Estado ACTIVO. Fecha de expedicion: 19/11/2026.';
const analyze = (text = certificate, extra: any = {}) =>
  analyzeCertificate({ ...base, text, ...extra });
describe('bounded local certificate decisions', () => {
  it('recognizes a current certificate with exact employee identity and unique provider', () =>
    expect(analyze()).toMatchObject({
      providerId: 'sanitas',
      identityVerified: true,
      reason: null,
      issuedAt: new Date('2026-11-19T00:00:00Z'),
    }));
  it('accepts dotted EPS headers', () =>
    expect(
      analyze(certificate.replace('EPS SANITAS', 'E.P.S. SANITAS')).reason,
    ).toBeNull());
  it('rejects explicit expiry and certificate-specific validity periods', () => {
    expect(analyze(certificate + ' VALIDO HASTA: 18/11/2026').reason).toBe(
      'EXPIRED',
    );
    expect(
      analyze(
        certificate.replace('19/11/2026', '01/10/2026') + ' VALIDEZ 30 DIAS',
      ).reason,
    ).toBe('EXPIRED');
  });
  it('recognizes ARL separately even when an EPS has the same brand', () =>
    expect(
      analyze(certificate.replace('EPS SANITAS', 'ARL SURAMERICANA'), {
        kind: 'ARL',
      }),
    ).toMatchObject({ providerId: 'arl-sura', reason: null }));
  it.each([
    [
      'wrong employee',
      certificate.replace('ANA MARIA PEREZ', 'OTRA PERSONA'),
      'IDENTITY_UNCONFIRMED',
    ],
    [
      'wrong ID',
      certificate.replace('1.234.567.890', '1122334455'),
      'IDENTITY_UNCONFIRMED',
    ],
    [
      'multiple employees',
      certificate + ' OTRA PERSONA CC 9988776655',
      'MULTIPLE_EMPLOYEES',
    ],
    ['multiple entities', certificate + ' SURA EPS', 'MULTIPLE_ENTITIES'],
    [
      'inactive',
      certificate.replace('ACTIVO', 'INACTIVO'),
      'INACTIVE_AFFILIATION',
    ],
    ['withdrawn', certificate + ' RETIRADO', 'INACTIVE_AFFILIATION'],
    [
      'missing status',
      certificate.replace('ACTIVO', 'PENDIENTE'),
      'STATUS_UNCONFIRMED',
    ],
    [
      'no issue date',
      certificate.replace('Fecha de expedicion: 19/11/2026.', ''),
      'DATE_UNCONFIRMED',
    ],
    ['old', certificate.replace('19/11/2026', '19/01/2026'), 'OLD_CERTIFICATE'],
    [
      'future',
      certificate.replace('19/11/2026', '20/11/2026'),
      'FUTURE_CERTIFICATE',
    ],
    [
      'wrong category',
      certificate.replace('EPS SANITAS', 'SANITAS'),
      'WRONG_KIND',
    ],
    ['unreadable', 'X', 'UNREADABLE'],
  ])('requires review for %s', (_label, text, reason) =>
    expect(analyze(text).reason).toBe(reason),
  );
  it('requires review rather than guessing an entity not in the catalog', () =>
    expect(
      analyze(certificate.replace('SANITAS', 'ENTIDAD DESCONOCIDA')).reason,
    ).toBe('ENTITY_UNKNOWN'));
  it('does not use inactive catalog entities', () =>
    expect(
      analyze(certificate, {
        providers: [{ ...base.providers[0], active: false }],
      }).reason,
    ).toBe('INACTIVE_ENTITY'));
  it('rejects expired file metadata', () =>
    expect(
      analyze(certificate, { expiresAt: new Date('2026-11-18T00:00:00Z') })
        .reason,
    ).toBe('EXPIRED'));
  it('handles Spanish issue dates and accents', () =>
    expect(
      analyze(
        certificate.replace(
          'Fecha de expedicion: 19/11/2026',
          'Se expide a los 19 días del mes de noviembre del año 2026',
        ),
      ).reason,
    ).toBeNull());
  it('preserves day boundaries in Colombia', () =>
    expect(
      analyze(certificate, { now: new Date('2026-11-19T02:00:00Z') }).reason,
    ).toBe('FUTURE_CERTIFICATE'));
});
