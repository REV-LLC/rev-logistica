import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CreateWorksiteDto } from './dto/create-worksite.dto';
import { UpdateWorksiteDto } from './dto/update-worksite.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  async create(payload: CreateCustomerDto) {
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          name: payload.name,
          nitOrId: payload.nitOrId ?? null,
          phone: payload.phone ?? null,
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
        name: payload.name,
        nitOrId: payload.nitOrId,
        phone: payload.phone,
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
            name: true,
            address: true,
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
      throw new BadRequestException('No se puede eliminar un cliente con obras asociadas');
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
            name: true,
            address: true,
            active: true,
            createdAt: true,
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
          address: payload.address ?? null,
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
              name: true,
              address: true,
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
        payload.address !== undefined ||
        payload.worksiteActive !== undefined
      ) {
        await tx.worksite.update({
          where: { id: relation.worksiteId },
          data: {
            name: payload.name ?? undefined,
            address: payload.address ?? undefined,
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
              name: true,
              address: true,
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
}
