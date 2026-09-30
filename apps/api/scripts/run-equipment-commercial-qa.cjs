// Isolated, loopback-only QA. Never reads .env or connects to the production database.
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const req = createRequire(path.join(root, 'package.json'));
Object.assign(process.env, {
  DATABASE_URL:
    'postgresql://transport_qa:transport_qa_local_only@127.0.0.1:54414/equipment_commercial_qa_20260930',
  JWT_SECRET: 'isolated-equipment-commercial-qa-20260930',
  AUTH_BYPASS_LOCAL: 'false',
  AUTH_BYPASS: 'false',
  NODE_ENV: 'test',
  NOTIFICATION_AUTO_DISPATCH: 'false',
  R2_ACCOUNT_ID: 'isolated-qa',
  R2_ACCESS_KEY_ID: 'isolated-qa',
  R2_SECRET_ACCESS_KEY: 'isolated-qa',
  R2_BUCKET: 'isolated-qa',
  R2_PUBLIC_BASE_URL: 'http://127.0.0.1:3059/qa-files',
});
const objects = new Map();
const { S3Client } = req('@aws-sdk/client-s3');
S3Client.prototype.send = async function (command) {
  const input = command.input;
  if (input.Bucket !== 'isolated-qa')
    throw new Error('External storage forbidden in QA');
  switch (command.constructor.name) {
    case 'PutObjectCommand':
      objects.set(input.Key, {
        data: Buffer.from(input.Body),
        contentType: input.ContentType,
      });
      return {};
    case 'DeleteObjectCommand':
      objects.delete(input.Key);
      return {};
    case 'GetObjectCommand': {
      const object = objects.get(input.Key);
      if (!object) throw new Error('QA object not found');
      const body = req('node:stream').Readable.from(object.data);
      body.transformToByteArray = async () => object.data;
      return { Body: body, ContentType: object.contentType };
    }
    default:
      throw new Error('Unsupported storage operation in QA');
  }
};
req('nodemailer').createTransport = () => ({
  sendMail: async () => ({
    messageId: 'qa-not-sent',
    accepted: [],
    rejected: [],
  }),
  verify: async () => true,
});
const { DocumentCustomerEmailsService } = req(
  path.join(
    root,
    'apps/api/dist/src/document-emails/document-customer-emails.service.js',
  ),
);
const { DocumentCustomerMessagesService } = req(
  path.join(
    root,
    'apps/api/dist/src/document-messages/document-customer-messages.service.js',
  ),
);
for (const method of ['sendDraftIfNeeded', 'sendFinalIfNeeded'])
  DocumentCustomerEmailsService.prototype[method] = async () => ({
    status: 'SKIPPED',
    reason: 'isolated QA',
  });
DocumentCustomerMessagesService.prototype.sendDraft = async () => ({
  status: 'SKIPPED',
  reason: 'isolated QA',
});
req(
  '@nestjs/schedule/dist/scheduler.orchestrator',
).SchedulerOrchestrator.prototype.onApplicationBootstrap = function () {};
const { NestFactory } = req('@nestjs/core');
const { PrismaClient } = req('@prisma/client');
const bcrypt = req('bcrypt');
const { AppModule } = req(path.join(root, 'apps/api/dist/src/app.module.js'));
(async () => {
  const prisma = new PrismaClient();
  for (const role of ['OFFICE', 'ADMIN', 'DRIVER']) {
    const email = `qa-config-${role.toLowerCase()}@example.invalid`;
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        role,
        passwordHash: await bcrypt.hash('Only-local-QA-20260923!', 10),
      },
    });
  }
  if (
    !(await prisma.warehouse.findFirst({
      where: { name: 'QA CONFIGURACION COMERCIAL' },
    }))
  ) {
    const owner = await prisma.owner.create({
      data: { name: 'QA CONFIGURACION COMERCIAL' },
    });
    await prisma.warehouse.create({
      data: {
        name: 'QA CONFIGURACION COMERCIAL',
        type: 'OWN',
        ownerCompanyId: owner.id,
      },
    });
  }
  await prisma.$disconnect();
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  });
  app.use('/qa-files', (request, response) => {
    const object = objects.get(decodeURIComponent(request.url.slice(1)));
    if (!object) return response.status(404).end();
    response.type(object.contentType).send(object.data);
  });
  app.enableCors({ origin: ['http://127.0.0.1:3159'], credentials: true });
  await app.listen(3059, '127.0.0.1');
  console.log(
    'QA API ready on127.0.0.1:3059; local DB only; mail, messages, storage and schedulers isolated.',
  );
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
