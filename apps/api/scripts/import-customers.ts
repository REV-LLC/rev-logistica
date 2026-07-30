import { CustomerIdentityDocumentType, PrismaClient } from '@prisma/client';
import { normalizeLegalName } from '../src/customers/normalize-legal-name';
import { loadJsonFile } from './load-json-file';

type NormalizedCustomer = {
  sourceRow: number;
  identityDocumentType: 'NIT' | 'CC' | null;
  nitOrId: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  importStatus: 'LISTO' | 'REVISAR' | 'EXCLUIR';
  observations: string | null;
};

const normalizedData = loadJsonFile<any>('clientes.normalized.json');
const prisma = new PrismaClient();
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const includeReview = args.has('--include-review');

const candidates = (normalizedData.customers as NormalizedCustomer[]).filter(
  (customer) => {
    if (customer.importStatus === 'LISTO') return true;
    return includeReview && customer.importStatus === 'REVISAR';
  },
);

const invalid = candidates.filter(
  (customer) =>
    !customer.identityDocumentType || !customer.nitOrId || !customer.name,
);
if (invalid.length) {
  throw new Error(
    `Hay ${invalid.length} registros candidatos sin tipo, documento o razón social. No se puede continuar.`,
  );
}

async function main() {
  const existing = await prisma.customer.findMany({
    where: {
      nitOrId: { in: candidates.map((customer) => customer.nitOrId as string) },
    },
    select: { id: true, identityDocumentType: true, nitOrId: true },
  });
  const existingByDocument = new Map(
    existing.map((customer) => [`${customer.nitOrId}`, customer]),
  );
  const creates = candidates.filter(
    (customer) => !existingByDocument.has(customer.nitOrId as string),
  ).length;

  console.log({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    candidates: candidates.length,
    creates,
    updates: candidates.length - creates,
    excludedReview: includeReview ? 0 : normalizedData.meta.totals.REVISAR,
    excluded: normalizedData.meta.totals.EXCLUIR,
  });

  if (!apply) {
    console.log(
      'Vista previa únicamente. Usa --apply para escribir en la base de datos.',
    );
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      for (const customer of candidates) {
        const data = {
          identityDocumentType:
            customer.identityDocumentType as CustomerIdentityDocumentType,
          nitOrId: customer.nitOrId,
          name: normalizeLegalName(customer.name as string),
          phone: customer.phone,
          email: customer.email,
          active: customer.active,
        };
        const match = existingByDocument.get(customer.nitOrId as string);
        if (match) {
          await tx.customer.update({ where: { id: match.id }, data });
        } else {
          await tx.customer.create({ data });
        }
      }
    },
    { timeout: 60_000 },
  );

  console.log(
    `Importación completada: ${candidates.length} clientes procesados.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
