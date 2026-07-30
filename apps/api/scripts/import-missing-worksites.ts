import { PrismaClient } from '@prisma/client';
import { loadJsonFile } from './load-json-file';

type NormalizedWorksite = {
  externalCode: string;
  name: string;
  address: string | null;
  phone: string | null;
  alternatePhone: string | null;
  email: string | null;
  active: boolean;
  customerDocument: string;
  linkStatus: 'LISTO' | 'REVISAR';
};

const normalizedData = loadJsonFile<any>('obras.normalized.json');
const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  const candidates = (normalizedData.worksites as NormalizedWorksite[]).filter(
    (worksite) => worksite.linkStatus === 'LISTO',
  );
  const existingCodes = new Set(
    (
      await prisma.worksite.findMany({
        where: {
          externalCode: {
            in: candidates.map((worksite) => worksite.externalCode),
          },
        },
        select: { externalCode: true },
      })
    ).map((worksite) => worksite.externalCode),
  );
  const missing = candidates.filter(
    (worksite) => !existingCodes.has(worksite.externalCode),
  );
  const customers = await prisma.customer.findMany({
    where: {
      nitOrId: {
        in: [...new Set(missing.map((worksite) => worksite.customerDocument))],
      },
    },
    select: { id: true, nitOrId: true },
  });
  const customerByDocument = new Map(
    customers.map((customer) => [customer.nitOrId, customer.id]),
  );
  const missingCustomerDocuments = [
    ...new Set(
      missing
        .filter(
          (worksite) => !customerByDocument.has(worksite.customerDocument),
        )
        .map((worksite) => worksite.customerDocument),
    ),
  ];

  console.log({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    candidates: candidates.length,
    missingWorksites: missing.length,
    missingCustomerDocuments,
    externalCodes: missing.map((worksite) => worksite.externalCode),
  });
  if (missingCustomerDocuments.length) {
    throw new Error(`Faltan clientes: ${missingCustomerDocuments.join(', ')}`);
  }
  if (!apply) return;

  await prisma.$transaction(async (tx) => {
    for (const input of missing) {
      const worksite = await tx.worksite.create({
        data: {
          externalCode: input.externalCode,
          name: input.name,
          address: input.address,
          phone: input.phone,
          alternatePhone: input.alternatePhone,
          email: input.email,
          active: input.active,
        },
      });
      await tx.customerWorksite.create({
        data: {
          customerId: customerByDocument.get(input.customerDocument)!,
          worksiteId: worksite.id,
          alias: input.name,
          active: input.active,
        },
      });
    }
  });
  console.log(`Importación completada: ${missing.length} obras creadas.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
