export type CertificateKind = 'EPS' | 'ARL';
export type CertificateProvider = {
  id: string;
  kind: string;
  name: string;
  active: boolean;
};
export type CertificateDecision = {
  providerId: string | null;
  identityVerified: boolean;
  issuedAt: Date | null;
  reason: string | null;
};
export const certificateReasons: Record<string, string> = {
  UNREADABLE: 'No pudimos leer el certificado. Revisa el archivo.',
  UNSUPPORTED: 'Sube un certificado PDF o una imagen PNG, JPG o WEBP.',
  TOO_LARGE: 'El certificado supera el límite de lectura automática (10 MB).',
  TOO_MANY_PAGES:
    'El certificado tiene más de cuatro páginas. Requiere revisión.',
  ENTITY_UNKNOWN: 'No se pudo identificar una entidad del catálogo.',
  MULTIPLE_ENTITIES:
    'Se encontró más de una entidad. Confirma cuál corresponde.',
  INACTIVE_ENTITY: 'La entidad identificada está inactiva en el catálogo.',
  IDENTITY_UNCONFIRMED:
    'No se pudo confirmar el nombre y la cédula del empleado.',
  MULTIPLE_EMPLOYEES: 'El archivo menciona más de un empleado registrado.',
  WRONG_KIND:
    'El contenido no permite confirmar que sea un certificado de esta categoría.',
  INACTIVE_AFFILIATION:
    'El certificado indica una afiliación inactiva o retirada.',
  STATUS_UNCONFIRMED: 'El certificado no confirma una afiliación activa.',
  DATE_UNCONFIRMED:
    'No se pudo confirmar la fecha de expedición del certificado.',
  OLD_CERTIFICATE: 'El certificado fue expedido hace más de 90 días.',
  FUTURE_CERTIFICATE: 'La fecha de expedición está en el futuro.',
  EXPIRED: 'El documento tiene una fecha de vencimiento anterior a hoy.',
  DIFFERENT_CURRENT:
    'El empleado ya tiene otra entidad asignada. Confirma el cambio.',
  CONCURRENT_CHANGE:
    'La afiliación cambió mientras se revisaba el certificado.',
  DOCUMENT_REMOVED: 'El documento ya no está disponible.',
  PROCESSING_INTERRUPTED: 'La lectura se interrumpió. Revisa el certificado.',
  SOURCE_NOT_OFFICE:
    'No se pudo confirmar que el archivo fue cargado por una cuenta activa de oficina.',
  EMPLOYEE_INACTIVE: 'El empleado ya no está activo.',
};
export function normalizedCertificate(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\bE P S\b/g, 'EPS')
    .replace(/\bA R L\b/g, 'ARL');
}
const aliases: Record<string, string[]> = {
  SURA: ['SURA', 'SURAMERICANA'],
  'NUEVA EPS': ['NUEVA EPS'],
  SANITAS: ['SANITAS'],
  'COMFENALCO VALLE EPS DE LA GENTE': ['COMFENALCO VALLE', 'EPS DE LA GENTE'],
  'SOS SERVICIO OCCIDENTAL DE SALUD': [
    'SERVICIO OCCIDENTAL DE SALUD',
    'EPS SOS',
  ],
  'PROTEGER EPS ANTES CAJACOPI': ['PROTEGER EPS', 'CAJACOPI'],
  'AXA COLPATRIA': ['AXA COLPATRIA', 'ARL COLPATRIA'],
  'COLMENA SEGUROS': ['COLMENA'],
  'COLSANITAS SEGUROS': ['COLSANITAS'],
  'LA EQUIDAD SEGUROS': ['LA EQUIDAD'],
  'SEGUROS BOLIVAR': ['SEGUROS BOLIVAR', 'ARL BOLIVAR'],
  'SEGUROS ALFA': ['SEGUROS ALFA', 'ARL ALFA'],
  'SEGUROS DE VIDA AURORA': ['AURORA'],
};
function includesPhrase(text: string, phrase: string) {
  return ` ${text} `.includes(` ${phrase} `);
}
export function containsIdentity(
  text: string,
  documentId: string | null | undefined,
) {
  if (/[^\d.\s-]/.test(documentId || '')) return false;
  const id = (documentId || '').replace(/\D/g, '');
  if (id.length < 5 || id.length > 15) return false;
  return new RegExp(`(?<!\\d)${id.split('').join('[.\\s-]*')}(?!\\d)`).test(
    text,
  );
}
function issueDate(
  text: string,
  labels = '(?:FECHA (?:DE )?(?:EXPEDICION|GENERACION|EMISION|IMPRESION|CERTIFICACION)|SE EXPIDE|EXPEDIDO|EMITIDO|GENERADO)',
): Date | null {
  const n = normalizedCertificate(text),
    months = [
      'ENERO',
      'FEBRERO',
      'MARZO',
      'ABRIL',
      'MAYO',
      'JUNIO',
      'JULIO',
      'AGOSTO',
      'SEPTIEMBRE',
      'OCTUBRE',
      'NOVIEMBRE',
      'DICIEMBRE',
    ];
  const windows = [...n.matchAll(new RegExp(labels, 'g'))].map((m) =>
    n.slice(m.index! + m[0].length, m.index! + m[0].length + 160),
  );
  const dates: Date[] = [];
  for (const w of windows) {
    let day: number, month: number, year: number;
    const iso = w.match(/^\D{0,30}(20\d{2})\D(\d{1,2})\D(\d{1,2})\b/),
      numeric = w.match(/^\D{0,30}(\d{1,2})\D(\d{1,2})\D(20\d{2})\b/),
      words = w.match(
        new RegExp(
          `^\\D{0,45}(\\d{1,2})\\D{0,35}(${months.join('|')})\\D{0,25}(20\\d{2})\\b`,
        ),
      );
    if (iso) {
      year = +iso[1];
      month = +iso[2];
      day = +iso[3];
    } else if (numeric) {
      day = +numeric[1];
      month = +numeric[2];
      year = +numeric[3];
    } else if (words) {
      day = +words[1];
      month = months.indexOf(words[2]) + 1;
      year = +words[3];
    } else continue;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    )
      dates.push(date);
  }
  const unique = [...new Map(dates.map((d) => [d.toISOString(), d])).values()];
  return unique.length === 1 ? unique[0] : null;
}
export function analyzeCertificate(input: {
  text: string;
  kind: CertificateKind;
  employee: { name: string; lastName: string; documentId: string | null };
  otherDocuments: Array<string | null>;
  providers: CertificateProvider[];
  now: Date;
  expiresAt?: Date | null;
}): CertificateDecision {
  const text = input.text.slice(0, 200000),
    n = normalizedCertificate(text);
  let providerId: string | null = null,
    identityVerified = false,
    issuedAt: Date | null = null;
  const decision = (reason: string | null) => ({
    providerId,
    identityVerified,
    issuedAt,
    reason,
  });
  if (n.length < 30) return decision('UNREADABLE');
  const matches = input.providers.filter(
    (p) =>
      p.kind === input.kind &&
      (
        aliases[normalizedCertificate(p.name)] || [
          normalizedCertificate(p.name),
        ]
      ).some((a) => includesPhrase(n, a)),
  );
  if (matches.length > 1) return decision('MULTIPLE_ENTITIES');
  if (matches.length === 1) providerId = matches[0].id;
  if (
    containsIdentity(text, input.employee.documentId) &&
    input.otherDocuments.some(
      (id) =>
        id &&
        id.replace(/\D/g, '') !==
          (input.employee.documentId || '').replace(/\D/g, '') &&
        containsIdentity(text, id),
    )
  )
    return decision('MULTIPLE_EMPLOYEES');
  const tokens = normalizedCertificate(
    `${input.employee.name} ${input.employee.lastName}`,
  )
    .split(' ')
    .filter((w) => w.length >= 3 && !['DEL', 'LOS', 'LAS'].includes(w));
  identityVerified =
    containsIdentity(text, input.employee.documentId) &&
    tokens.length >= 2 &&
    tokens.every((w) => includesPhrase(n, w));
  if (!identityVerified) return decision('IDENTITY_UNCONFIRMED');
  if (!providerId) return decision('ENTITY_UNKNOWN');
  if (!matches[0].active) return decision('INACTIVE_ENTITY');
  const kindConfirmed =
    input.kind === 'EPS'
      ? /\bEPSI?\b|PROMOTORA DE SALUD|SISTEMA GENERAL DE SEGURIDAD SOCIAL EN SALUD|REGIMEN CONTRIBUTIVO/.test(
          n,
        )
      : /\bARL\b|RIESGOS LABORALES|RIESGOS PROFESIONALES/.test(n);
  if (
    !kindConfirmed ||
    !/CERTIFIC|CONSTANCIA|HACE CONSTAR/.test(n) ||
    !/AFILIAD[OA]|AFILIACION|VINCULAD[OA]/.test(n)
  )
    return decision('WRONG_KIND');
  if (
    /\b(?:INACTIV[OA]|RETIRAD[OA]|DESAFILIAD[OA]|SUSPENDID[OA])\b|\bNO SE ENCUENTRA AFILIAD/.test(
      n,
    )
  )
    return decision('INACTIVE_AFFILIATION');
  if (!/\b(?:ACTIV[OA]|VIGENTE)\b/.test(n))
    return decision('STATUS_UNCONFIRMED');
  const today = new Date(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(input.now) + 'T00:00:00Z',
  );
  if (input.expiresAt && input.expiresAt < today) return decision('EXPIRED');
  issuedAt = issueDate(text);
  if (!issuedAt) return decision('DATE_UNCONFIRMED');
  const expiryLabels =
    '(?:VALIDO HASTA|VIGENTE HASTA|FECHA (?:DE )?VENCIMIENTO)';
  if (new RegExp(expiryLabels).test(n)) {
    const expiry = issueDate(text, expiryLabels);
    if (!expiry) return decision('DATE_UNCONFIRMED');
    if (expiry < today) return decision('EXPIRED');
  }
  const age = (today.getTime() - issuedAt.getTime()) / 86400000;
  const days = n.match(/(?:VALIDO|VALIDEZ|VIGENCIA)\D{0,35}(\d{1,3}) DIAS?\b/);
  if (days && +days[1] > 0 && age > +days[1]) return decision('EXPIRED');
  if (age < 0) return decision('FUTURE_CERTIFICATE');
  if (age > 90) return decision('OLD_CERTIFICATE');
  return decision(null);
}
