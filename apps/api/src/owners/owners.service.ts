import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOwnerDto } from './dto/create-owner.dto';

export type OwnerLogoFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

const OWNER_SELECT = {
  id: true,
  name: true,
  active: true,
  logoUrl: true,
  logoKey: true,
} as const;

const MAX_LOGO_SIZE_BYTES = 1 * 1024 * 1024;
const ALLOWED_LOGO_MIME_TYPES = new Set(['image/png', 'image/webp', 'image/jpeg']);
const LOGO_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
};

@Injectable()
export class OwnersService {
  constructor(private readonly prisma: PrismaService) {}

  listOwners() {
    return this.prisma.owner.findMany({
      select: OWNER_SELECT,
      orderBy: {
        name: 'asc',
      },
    });
  }

  async createOwner(payload: CreateOwnerDto) {
    const name = payload.name.trim();
    if (!name) {
      throw new BadRequestException('Owner name is required');
    }

    return this.prisma.owner.create({
      data: {
        name,
        nitOrId: this.normalizeOptionalString(payload.nitOrId),
        phone: this.normalizeOptionalString(payload.phone),
        email: this.normalizeOptionalString(payload.email),
        active: payload.active ?? true,
      },
      select: OWNER_SELECT,
    });
  }

  async uploadLogo(ownerId: string, file?: OwnerLogoFile) {
    if (!file) {
      throw new BadRequestException('Logo file is required');
    }
    this.validateLogoFile(file);

    const owner = await this.prisma.owner.findUnique({
      where: { id: ownerId },
      select: { id: true },
    });
    if (!owner) {
      throw new NotFoundException('Owner not found');
    }

    const config = this.getR2Config();
    const extension = LOGO_EXTENSION_BY_MIME_TYPE[file.mimetype];
    const logoKey = `owners/${ownerId}/logo-${randomUUID()}.${extension}`;
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    await s3.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: logoKey,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    const logoUrl = `${config.publicBaseUrl}/${logoKey}`;
    return this.prisma.owner.update({
      where: { id: ownerId },
      data: { logoUrl, logoKey },
      select: OWNER_SELECT,
    });
  }

  private validateLogoFile(file: OwnerLogoFile) {
    if (file.size > MAX_LOGO_SIZE_BYTES) {
      throw new BadRequestException('Logo must be 1 MB or smaller');
    }
    if (!ALLOWED_LOGO_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Logo must be PNG, WEBP, or JPEG');
    }
    if (!file.buffer?.length) {
      throw new BadRequestException('Logo file is empty');
    }
    if (!this.hasExpectedImageSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException('Logo content does not match the declared image type');
    }
  }

  private normalizeOptionalString(value?: string) {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }

  private hasExpectedImageSignature(buffer: Buffer, mimetype: string) {
    if (mimetype === 'image/png') {
      return buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (mimetype === 'image/jpeg') {
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (mimetype === 'image/webp') {
      return (
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    }
    return false;
  }

  private getR2Config() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET;
    const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, '');

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
      throw new InternalServerErrorException('R2 storage is not configured');
    }

    return {
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
      publicBaseUrl,
    };
  }
}
