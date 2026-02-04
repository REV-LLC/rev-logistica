import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

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
    return this.prisma.customer.create({
      data: {
        name: payload.name,
        nitOrId: payload.nitOrId ?? null,
        phone: payload.phone ?? null,
        active: payload.active ?? true,
      },
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
}
