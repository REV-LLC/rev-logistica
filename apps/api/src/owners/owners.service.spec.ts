import { S3Client } from '@aws-sdk/client-s3';
import { NotFoundException } from '@nestjs/common';
import { OwnersService } from './owners.service';

describe('OwnersService', () => {
  const owner = {
    id: '11111111-1111-4111-8111-111111111111',
    logoKey: 'owners/provider/logo.png',
  };
  const prisma = {
    owner: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  let service: OwnersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OwnersService(prisma as never);
  });

  it('rejects removing the logo of an unknown provider', async () => {
    prisma.owner.findUnique.mockResolvedValue(null);

    await expect(service.removeLogo(owner.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.owner.update).not.toHaveBeenCalled();
  });

  it('clears legacy logo fields when there is no storage key', async () => {
    prisma.owner.findUnique.mockResolvedValue({ ...owner, logoKey: null });
    prisma.owner.update.mockResolvedValue({ ...owner, logoKey: null, logoUrl: null });

    await service.removeLogo(owner.id);

    expect(prisma.owner.update).toHaveBeenCalledWith({
      where: { id: owner.id },
      data: { logoUrl: null, logoKey: null },
      select: expect.any(Object),
    });
  });

  it('deletes the stored object before clearing the provider logo fields', async () => {
    const previousEnv = {
      accountId: process.env.R2_ACCOUNT_ID,
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      bucket: process.env.R2_BUCKET,
      publicBaseUrl: process.env.R2_PUBLIC_BASE_URL,
    };
    process.env.R2_ACCOUNT_ID = 'account';
    process.env.R2_ACCESS_KEY_ID = 'access';
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    process.env.R2_BUCKET = 'bucket';
    process.env.R2_PUBLIC_BASE_URL = 'https://files.example.com';
    prisma.owner.findUnique.mockResolvedValue(owner);
    prisma.owner.update.mockResolvedValue({ ...owner, logoKey: null, logoUrl: null });
    const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);

    try {
      await service.removeLogo(owner.id);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0].input).toEqual({
        Bucket: 'bucket',
        Key: owner.logoKey,
      });
      expect(prisma.owner.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: owner.id },
        data: { logoUrl: null, logoKey: null },
      }));
    } finally {
      send.mockRestore();
      const restore = (key: string, value: string | undefined) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      };
      restore('R2_ACCOUNT_ID', previousEnv.accountId);
      restore('R2_ACCESS_KEY_ID', previousEnv.accessKeyId);
      restore('R2_SECRET_ACCESS_KEY', previousEnv.secretAccessKey);
      restore('R2_BUCKET', previousEnv.bucket);
      restore('R2_PUBLIC_BASE_URL', previousEnv.publicBaseUrl);
    }
  });
});
