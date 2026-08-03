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

type CustomerBilling = {
  customerDocument: string;
  billingAddress: string | null;
  billingPhone: string | null;
  billingAlternatePhone: string | null;
  documentsEmail: string | null;
};

const normalizedData = loadJsonFile<any>('obras.normalized.json');
const prisma = new PrismaClient();
const apply = process.argv.slice(2).includes('--apply');
const worksites = (normalizedData.worksites as NormalizedWorksite[]).filter(
  (worksite) => worksite.linkStatus === 'LISTO',
);
const customerBilling = normalizedData.customerBilling as CustomerBilling[];

async function main() {
  const customerDocuments = [...new Set(worksites.map((worksite) => worksite.customerDocument))];
  const customers = await prisma.customer.findMany({
    where: { nitOrId: { in: customerDocuments } },
    select: { id: true, nitOrId: true },
  });
  const customerByDocument = new Map(
    customers.map((customer) => [customer.nitOrId as string, customer]),
  );
  const missingCustomers = customerDocuments.filter(
    (document) => !customerByDocument.has(document),
  );
  if (missingCustomers.length) {
    throw new Error(
      `Faltan ${missingCustomers.length} clientes para vincular las obras: ${missingCustomers.join(', ')}`,
    );
  }

  const existingWorksites = await prisma.worksite.findMany({
    where: { externalCode: { in: worksites.map((worksite) => worksite.externalCode) } },
    select: { id: true, externalCode: true },
  });
  const existingCodes = new Set(
    existingWorksites.map((worksite) => worksite.externalCode as string),
  );
  const creates = worksites.filter(
    (worksite) => !existingCodes.has(worksite.externalCode),
  ).length;

  console.log({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    worksiteCandidates: worksites.length,
    creates,
    updates: worksites.length - creates,
    customerBillingUpdates: customerBilling.length,
    billingConflictsReviewed: normalizedData.meta.totals.billingConflicts,
  });

  if (!apply) {
    console.log('Vista previa únicamente. Usa --apply para escribir en la base de datos.');
    return;
  }

  for (const billing of customerBilling) {
    const customer = customerByDocument.get(billing.customerDocument);
    if (!customer) continue;
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        billingAddress: billing.billingAddress,
        billingPhone: billing.billingPhone,
        billingAlternatePhone: billing.billingAlternatePhone,
        documentsEmail: billing.documentsEmail,
      },
    });
  }

  for (const input of worksites) {
    const customer = customerByDocument.get(input.customerDocument);
    if (!customer) throw new Error(`Cliente no encontrado: ${input.customerDocument}`);
    const worksite = await prisma.worksite.upsert({
      where: { externalCode: input.externalCode },
      create: {
        externalCode: input.externalCode,
        name: input.name,
        address: input.address,
        phone: input.phone,
        alternatePhone: input.alternatePhone,
        email: input.email,
        active: input.active,
      },
      update: {
        name: input.name,
        address: input.address,
        phone: input.phone,
        alternatePhone: input.alternatePhone,
        email: input.email,
        active: input.active,
      },
    });
    const relation = await prisma.customerWorksite.findFirst({
      where: { worksiteId: worksite.id },
      select: { id: true },
    });
    if (relation) {
      await prisma.customerWorksite.update({
        where: { id: relation.id },
        data: {
          customerId: customer.id,
          alias: input.name,
          active: input.active,
        },
      });
    } else {
      await prisma.customerWorksite.create({
        data: {
          customerId: customer.id,
          worksiteId: worksite.id,
          alias: input.name,
          active: input.active,
        },
      });
    }
  }

  console.log(`Importación completada: ${worksites.length} obras procesadas.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
