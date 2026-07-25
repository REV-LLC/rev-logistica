import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { EmployeeRole, Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import type { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';

export type EmployeePhotoFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

const MAX_PROFILE_PHOTO_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_PROFILE_PHOTO_MIME_TYPES = new Set(['image/png', 'image/webp', 'image/jpeg']);

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async listEmployees() {
    const employees = await this.prisma.employee.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        lastName: true,
        role: true,
        phone: true,
        email: true,
        documentId: true,
        active: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            active: true,
          },
        },
        vehicles: {
          select: {
            vehicle: {
              select: { id: true, plate: true, brand: true, model: true, type: true, active: true },
            },
          },
        },
      },
    });

    return employees.map((employee) => ({
      ...employee,
      vehicles: employee.vehicles.map((entry) => entry.vehicle),
    }));
  }

  async createEmployee(payload: {
    name: string;
    lastName: string;
    role: string;
    phone?: string;
    email?: string;
    documentId?: string;
    vehicleIds?: string[];
    loginIdentifier?: string;
    loginEmail?: string;
    loginPassword?: string;
    loginRole?: Role;
    loginActive?: boolean;
  }) {
    const vehicleIds = payload.vehicleIds ?? [];
    if (vehicleIds.length) {
      await this.assertVehiclesExist(vehicleIds);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        let createdUserId: string | null = null;
        const normalizedLoginIdentifier = (payload.loginIdentifier ?? payload.loginEmail)?.trim().toLowerCase();
        const wantsLogin = Boolean(
          normalizedLoginIdentifier || payload.loginPassword || payload.loginRole || payload.loginActive !== undefined,
        );

        if (wantsLogin) {
          if (!normalizedLoginIdentifier) {
            throw new BadRequestException('El usuario o correo de acceso es obligatorio');
          }
          if (!payload.loginPassword?.trim()) {
            throw new BadRequestException('La contraseña de acceso es obligatoria');
          }
          const userRole = payload.loginRole ?? this.mapEmployeeRoleToUserRole(payload.role as EmployeeRole);
          const passwordHash = await bcrypt.hash(payload.loginPassword.trim(), 10);
          const user = await tx.user.create({
            data: {
              email: normalizedLoginIdentifier,
              passwordHash,
              role: userRole,
              active: payload.loginActive ?? true,
            },
            select: { id: true },
          });
          createdUserId = user.id;
        }

        const created = await tx.employee.create({
          data: {
            name: payload.name,
            lastName: payload.lastName,
            role: payload.role as any,
            phone: payload.phone ?? null,
            email: payload.email ?? null,
            documentId: payload.documentId ?? null,
            userId: createdUserId,
          },
        });

        if (vehicleIds.length) {
          await tx.employeeVehicle.createMany({
            data: vehicleIds.map((vehicleId) => ({
              employeeId: created.id,
              vehicleId,
            })),
          });
        }

        return created;
      });
    } catch (error) {
      this.rethrowConstraint(error);
    }
  }

  async updateEmployee(
    employeeId: string,
    payload: {
      name?: string;
      lastName?: string;
      role?: string;
      phone?: string;
      email?: string;
      documentId?: string;
      active?: boolean;
      vehicleIds?: string[];
      loginEnabled?: boolean;
      loginIdentifier?: string;
      loginEmail?: string;
      loginPassword?: string;
      loginRole?: Role;
      loginActive?: boolean;
    },
  ) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, role: true, userId: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const vehicleIds = payload.vehicleIds;
    if (vehicleIds && vehicleIds.length) {
      await this.assertVehiclesExist(vehicleIds);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const nextEmployeeRole = (payload.role as EmployeeRole | undefined) ?? employee.role;

        const normalizedLoginIdentifier = (payload.loginIdentifier ?? payload.loginEmail)?.trim().toLowerCase();
        const wantsLogin =
          payload.loginEnabled === true ||
          normalizedLoginIdentifier !== undefined ||
          payload.loginPassword !== undefined ||
          payload.loginRole !== undefined ||
          payload.loginActive !== undefined;

        if (payload.loginEnabled === false && employee.userId) {
          await tx.user.update({
            where: { id: employee.userId },
            data: { active: false },
          });
        } else if (wantsLogin) {
          if (employee.userId) {
            const data: Prisma.UserUpdateInput = {};
            if (normalizedLoginIdentifier) data.email = normalizedLoginIdentifier;
            if (payload.loginRole) data.role = payload.loginRole;
            if (payload.loginActive !== undefined) data.active = payload.loginActive;
            if (payload.loginPassword?.trim()) {
              data.passwordHash = await bcrypt.hash(payload.loginPassword.trim(), 10);
            }
            if (Object.keys(data).length) {
              await tx.user.update({
                where: { id: employee.userId },
                data,
              });
            }
          } else {
            if (!normalizedLoginIdentifier) {
              throw new BadRequestException('El usuario o correo de acceso es obligatorio');
            }
            if (!payload.loginPassword?.trim()) {
              throw new BadRequestException('La contraseña de acceso es obligatoria');
            }
            const userRole = payload.loginRole ?? this.mapEmployeeRoleToUserRole(nextEmployeeRole);
            const passwordHash = await bcrypt.hash(payload.loginPassword.trim(), 10);
            const user = await tx.user.create({
              data: {
                email: normalizedLoginIdentifier,
                passwordHash,
                role: userRole,
                active: payload.loginActive ?? true,
              },
              select: { id: true },
            });
            await tx.employee.update({
              where: { id: employeeId },
              data: { userId: user.id },
            });
          }
        }

        const updated = await tx.employee.update({
          where: { id: employeeId },
          data: {
            name: payload.name,
            lastName: payload.lastName,
            role: payload.role as any,
            phone: payload.phone,
            email: payload.email,
            documentId: payload.documentId,
            active: payload.active,
          },
        });

        if (vehicleIds) {
          await tx.employeeVehicle.deleteMany({ where: { employeeId } });
          if (vehicleIds.length) {
            await tx.employeeVehicle.createMany({
              data: vehicleIds.map((vehicleId) => ({
                employeeId,
                vehicleId,
              })),
            });
          }
        }

        return updated;
      });
    } catch (error) {
      this.rethrowConstraint(error);
    }
  }

  async deleteEmployee(employeeId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.employeeVehicle.deleteMany({ where: { employeeId } });
      await tx.employee.delete({ where: { id: employeeId } });
      return { deleted: true };
    });
  }

  async getEmployeePhoto(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const config = this.getR2Config();
    const s3 = this.createR2Client(config);
    const keys = [`employees/${employeeId}/profile`, `employees/${employeeId}/profile.webp`];

    for (const key of keys) {
      try {
        const object = await s3.send(
          new GetObjectCommand({
            Bucket: config.bucket,
            Key: key,
          }),
        );

        if (!object.Body) {
          throw new NotFoundException('Employee photo not found');
        }

        return {
          body: object.Body as Readable,
          contentType: object.ContentType ?? 'image/webp',
          contentLength: object.ContentLength,
          etag: object.ETag,
        };
      } catch (error) {
        if (this.isMissingR2Object(error)) {
          continue;
        }
        throw error;
      }
    }

    throw new NotFoundException('Employee photo not found');
  }

  async uploadEmployeePhoto(employeeId: string, file?: EmployeePhotoFile) {
    if (!file) {
      throw new BadRequestException('Profile photo file is required');
    }
    this.validateProfilePhotoFile(file);

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const config = this.getR2Config();
    const key = `employees/${employeeId}/profile`;

    await this.createR2Client(config).send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return { uploaded: true };
  }

  private async assertVehiclesExist(vehicleIds: string[]) {
    const unique = [...new Set(vehicleIds)];
    const count = await this.prisma.vehicle.count({ where: { id: { in: unique } } });
    if (count !== unique.length) {
      throw new BadRequestException('One or more vehicleIds are invalid');
    }
  }

  private mapEmployeeRoleToUserRole(role: EmployeeRole): Role {
    if (role === 'DRIVER') return Role.DRIVER;
    if (role === 'HEAVY_MACHINERY_OPERATOR' || role === 'MACHINIST' || role === 'MECHANIC') {
      return Role.OPERATOR;
    }
    return Role.OFFICE;
  }

  private createR2Client(config: ReturnType<EmployeesService['getR2Config']>) {
    return new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  private getR2Config() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET;

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      throw new InternalServerErrorException('R2 storage is not configured');
    }

    return {
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
    };
  }

  private validateProfilePhotoFile(file: EmployeePhotoFile) {
    if (file.size > MAX_PROFILE_PHOTO_SIZE_BYTES) {
      throw new BadRequestException('Profile photo must be 2 MB or smaller');
    }
    if (!ALLOWED_PROFILE_PHOTO_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Profile photo must be PNG, WEBP, or JPEG');
    }
    if (!file.buffer?.length) {
      throw new BadRequestException('Profile photo file is empty');
    }
    if (!this.hasExpectedImageSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException('Profile photo content does not match the declared image type');
    }
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

  private isMissingR2Object(error: unknown) {
    return (
      error instanceof NoSuchKey ||
      (typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        ['NoSuchKey', 'NotFound'].includes(String(error.name)))
    );
  }

  private rethrowConstraint(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new BadRequestException('El email de acceso ya está en uso');
    }
    throw error;
  }
}
