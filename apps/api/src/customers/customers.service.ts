import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerRutPdfParserService } from './customer-rut-pdf-parser.service';
import type {
  CustomerRutPdfUpload,
  ParsedCustomerRutData,
} from './customer-rut-pdf-parser.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CreateWorksiteDto } from './dto/create-worksite.dto';
import { UpdateWorksiteDto } from './dto/update-worksite.dto';
import { normalizeLegalName } from './normalize-legal-name';
import { randomBytes } from 'crypto';
import { PublicCustomerUpdateDto } from './dto/public-customer-update.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rutPdfParser: CustomerRutPdfParserService,
  ) {}

  async list() {
    return this.prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createUpdateLink(id: string) {
    await this.getById(id);
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.prisma.customer.update({
      where: { id },
      data: { updateToken: token, updateTokenExpiresAt: expiresAt },
    });
    return { token, expiresAt };
  }

  async getPublicUpdate(token: string) {
    const customer = await this.customerForToken(token);
    return {
      name: customer.name,
      nitOrId: customer.nitOrId,
      contacts: Array.isArray(customer.contactDirectory) ? customer.contactDirectory : [],
      documentsPhone: customer.documentsPhone ?? customer.phone ?? '',
      documentsEmail: customer.documentsEmail ?? customer.email ?? '',
    };
  }

  async applyPublicUpdate(token: string, payload: PublicCustomerUpdateDto) {
    const customer = await this.customerForToken(token);
    await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        contactDirectory: payload.contacts as unknown as Prisma.InputJsonValue,
        phone: payload.contacts.find((contact) => contact.type === 'GENERAL')?.phone ?? customer.phone,
        email: payload.contacts.find((contact) => contact.type === 'GENERAL')?.email ?? customer.email,
        documentsPhone: payload.documentsPhone.trim(),
        documentsEmail: payload.documentsEmail.trim().toLowerCase(),
        contactUpdatedAt: new Date(),
        contactUpdatedBy: payload.updatedBy.trim(),
        updateToken: null,
        updateTokenExpiresAt: null,
      },
    });
    return { updated: true };
  }

  private async customerForToken(token: string) {
    const customer = await this.prisma.customer.findUnique({ where: { updateToken: token } });
    if (!customer || !customer.updateTokenExpiresAt || customer.updateTokenExpiresAt < new Date()) {
      throw new NotFoundException('El enlace no existe o ya venció');
    }
    return customer;
  }

  async getById(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  async parseRutPdf(
    file?: CustomerRutPdfUpload,
  ): Promise<ParsedCustomerRutData> {
    return this.rutPdfParser.parse(file);
  }

  async create(payload: CreateCustomerDto) {
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          name: normalizeLegalName(payload.name),
          identityDocumentType: payload.identityDocumentType ?? null,
          nitOrId: payload.nitOrId ?? null,
          phone: payload.phone ?? null,
          email: this.normalizeOptionalEmail(payload.email),
          documentsEmail: this.normalizeOptionalEmail(payload.documentsEmail),
          billingAddress: this.normalizeOptionalString(payload.billingAddress),
          billingPhone: this.normalizeOptionalString(payload.billingPhone),
          billingAlternatePhone: this.normalizeOptionalString(
            payload.billingAlternatePhone,
          ),
          active: payload.active ?? true,
        },
      });

      if (payload.initialWorksite) {
        const worksite = await tx.worksite.create({
          data: {
            name: payload.initialWorksite.name,
            address: payload.initialWorksite.address ?? null,
            active: payload.initialWorksite.active ?? true,
          },
        });

        await tx.customerWorksite.create({
          data: {
            customerId: customer.id,
            worksiteId: worksite.id,
            alias: payload.initialWorksite.alias ?? null,
            active: payload.initialWorksite.active ?? true,
          },
        });
      }

      return customer;
    });
  }

  async update(id: string, payload: UpdateCustomerDto) {
    await this.getById(id);
    return this.prisma.customer.update({
      where: { id },
      data: {
        name:
          payload.name !== undefined
            ? normalizeLegalName(payload.name)
            : undefined,
        identityDocumentType: payload.identityDocumentType,
        nitOrId: payload.nitOrId,
        phone: payload.phone,
        email:
          payload.email !== undefined
            ? this.normalizeOptionalEmail(payload.email)
            : undefined,
        documentsEmail:
          payload.documentsEmail !== undefined
            ? this.normalizeOptionalEmail(payload.documentsEmail)
            : undefined,
        billingAddress:
          payload.billingAddress !== undefined
            ? this.normalizeOptionalString(payload.billingAddress)
            : undefined,
        billingPhone:
          payload.billingPhone !== undefined
            ? this.normalizeOptionalString(payload.billingPhone)
            : undefined,
        billingAlternatePhone:
          payload.billingAlternatePhone !== undefined
            ? this.normalizeOptionalString(payload.billingAlternatePhone)
            : undefined,
        active: payload.active,
      },
    });
  }

  async listWorksites(customerId: string) {
    await this.getById(customerId);

    return this.prisma.customerWorksite.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        alias: true,
        active: true,
        createdAt: true,
        worksite: {
          select: {
            id: true,
            externalCode: true,
            name: true,
            address: true,
            contactName: true,
            phone: true,
            alternatePhone: true,
            email: true,
            active: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async remove(id: string) {
    await this.getById(id);

    const worksitesCount = await this.prisma.customerWorksite.count({
      where: { customerId: id },
    });

    if (worksitesCount > 0) {
      throw new BadRequestException(
        'No se puede eliminar un cliente con obras asociadas',
      );
    }

    return this.prisma.customer.delete({
      where: { id },
    });
  }

  async listAllWorksites() {
    return this.prisma.customerWorksite.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        alias: true,
        active: true,
        createdAt: true,
        customer: {
          select: {
            id: true,
            name: true,
            active: true,
          },
        },
        worksite: {
          select: {
            id: true,
            externalCode: true,
            name: true,
            address: true,
            contactName: true,
            phone: true,
            alternatePhone: true,
            email: true,
            active: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async listDriverWorksiteDirectory() {
    return this.prisma.customerWorksite.findMany({
      where: {
        active: true,
        customer: { active: true },
        worksite: { active: true },
      },
      orderBy: [{ worksite: { name: 'asc' } }, { id: 'asc' }],
      select: {
        id: true,
        alias: true,
        customer: { select: { name: true } },
        worksite: {
          select: {
            name: true,
            address: true,
            contactName: true,
            phone: true,
            alternatePhone: true,
          },
        },
      },
    });
  }

  async createWorksite(payload: CreateWorksiteDto) {
    await this.getById(payload.customerId);

    return this.prisma.$transaction(async (tx) => {
      const worksite = await tx.worksite.create({
        data: {
          name: payload.name,
          externalCode: payload.externalCode ?? null,
          address: payload.address ?? null,
          contactName: payload.contactName?.trim() || null,
          phone: payload.phone ?? null,
          alternatePhone: payload.alternatePhone ?? null,
          email: this.normalizeOptionalEmail(payload.email),
          active: payload.active ?? true,
        },
      });

      const customerWorksite = await tx.customerWorksite.create({
        data: {
          customerId: payload.customerId,
          worksiteId: worksite.id,
          alias: payload.alias ?? null,
          active: payload.active ?? true,
        },
      });

      return tx.customerWorksite.findUnique({
        where: { id: customerWorksite.id },
        select: {
          id: true,
          alias: true,
          active: true,
          createdAt: true,
          customer: {
            select: { id: true, name: true, active: true },
          },
          worksite: {
            select: {
              id: true,
              externalCode: true,
              name: true,
              address: true,
              contactName: true,
              phone: true,
              alternatePhone: true,
              email: true,
              active: true,
              createdAt: true,
            },
          },
        },
      });
    });
  }

  async updateWorksite(customerWorksiteId: string, payload: UpdateWorksiteDto) {
    const relation = await this.prisma.customerWorksite.findUnique({
      where: { id: customerWorksiteId },
      select: { id: true, worksiteId: true },
    });
    if (!relation) {
      throw new NotFoundException('Worksite relation not found');
    }

    if (payload.customerId) {
      await this.getById(payload.customerId);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.customerWorksite.update({
        where: { id: customerWorksiteId },
        data: {
          customerId: payload.customerId ?? undefined,
          alias: payload.alias ?? undefined,
          active: payload.active ?? undefined,
        },
      });

      if (
        payload.name !== undefined ||
        payload.externalCode !== undefined ||
        payload.address !== undefined ||
        payload.contactName !== undefined ||
        payload.phone !== undefined ||
        payload.alternatePhone !== undefined ||
        payload.email !== undefined ||
        payload.worksiteActive !== undefined
      ) {
        await tx.worksite.update({
          where: { id: relation.worksiteId },
          data: {
            name: payload.name ?? undefined,
            externalCode: payload.externalCode ?? undefined,
            address: payload.address ?? undefined,
            contactName:
              payload.contactName !== undefined
                ? payload.contactName.trim() || null
                : undefined,
            phone: payload.phone ?? undefined,
            alternatePhone: payload.alternatePhone ?? undefined,
            email:
              payload.email !== undefined
                ? this.normalizeOptionalEmail(payload.email)
                : undefined,
            active: payload.worksiteActive ?? undefined,
          },
        });
      }

      return tx.customerWorksite.findUnique({
        where: { id: customerWorksiteId },
        select: {
          id: true,
          alias: true,
          active: true,
          createdAt: true,
          customer: {
            select: { id: true, name: true, active: true },
          },
          worksite: {
            select: {
              id: true,
              externalCode: true,
              name: true,
              address: true,
              contactName: true,
              phone: true,
              alternatePhone: true,
              email: true,
              active: true,
              createdAt: true,
            },
          },
        },
      });
    });
  }

  async removeWorksite(customerWorksiteId: string) {
    const relation = await this.prisma.customerWorksite.findUnique({
      where: { id: customerWorksiteId },
      select: { id: true, worksiteId: true },
    });
    if (!relation) {
      throw new NotFoundException('Worksite relation not found');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.customerWorksite.delete({
        where: { id: customerWorksiteId },
      });

      const remaining = await tx.customerWorksite.count({
        where: { worksiteId: relation.worksiteId },
      });

      if (remaining === 0) {
        await tx.worksite.delete({
          where: { id: relation.worksiteId },
        });
      }

      return { id: customerWorksiteId, deleted: true };
    });
  }

  private normalizeOptionalEmail(value?: string) {
    const email = value?.trim().toLowerCase();
    return email || null;
  }

  private normalizeOptionalString(value?: string) {
    const normalized = value?.trim();
    return normalized || null;
  }
}
