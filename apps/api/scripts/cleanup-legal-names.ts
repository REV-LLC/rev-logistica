import { PrismaClient } from '@prisma/client';
import { normalizeLegalName } from '../src/customers/normalize-legal-name';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  const customers = await prisma.customer.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const changes = customers
    .map((customer) => ({
      ...customer,
      normalizedName: normalizeLegalName(customer.name),
    }))
    .filter((customer) => customer.name !== customer.normalizedName);

  console.log({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    customers: customers.length,
    changes: changes.length,
    preview: changes.slice(0, 10).map(({ name, normalizedName }) => ({
      before: name,
      after: normalizedName,
    })),
  });

  if (!apply) {
    console.log(
      'Vista previa únicamente. Usa --apply para escribir en la base de datos.',
    );
    return;
  }

  for (const customer of changes) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: { name: customer.normalizedName },
    });
  }

  console.log(
    `Normalización completada: ${changes.length} razones sociales actualizadas.`,
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
