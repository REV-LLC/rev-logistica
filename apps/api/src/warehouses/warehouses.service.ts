import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  async listWarehouses() {
    return this.prisma.warehouse.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        active: true,
        ownerCompanyId: true,
        ownerCompany: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getWarehouse(warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: {
        id: true,
        name: true,
        type: true,
        active: true,
        ownerCompanyId: true,
        ownerCompany: { select: { id: true, name: true } },
      },
    });
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }
    return warehouse;
  }

  async createWarehouse(payload: CreateWarehouseDto) {
    const owner = await this.prisma.owner.findUnique({
      where: { id: payload.ownerCompanyId },
      select: { id: true },
    });
    if (!owner) {
      throw new NotFoundException('Owner company not found');
    }

    return this.prisma.warehouse.create({
      data: {
        name: payload.name,
        type: payload.type,
        ownerCompanyId: payload.ownerCompanyId,
        active: payload.active ?? true,
      },
      select: {
        id: true,
        name: true,
        type: true,
        active: true,
        ownerCompanyId: true,
        ownerCompany: { select: { id: true, name: true } },
      },
    });
  }

  async updateWarehouse(warehouseId: string, payload: UpdateWarehouseDto) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true },
    });
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    if (payload.ownerCompanyId) {
      const owner = await this.prisma.owner.findUnique({
        where: { id: payload.ownerCompanyId },
        select: { id: true },
      });
      if (!owner) {
        throw new NotFoundException('Owner company not found');
      }
    }

    return this.prisma.warehouse.update({
      where: { id: warehouseId },
      data: {
        name: payload.name ?? undefined,
        type: payload.type ?? undefined,
        ownerCompanyId: payload.ownerCompanyId ?? undefined,
        active: payload.active ?? undefined,
      },
      select: {
        id: true,
        name: true,
        type: true,
        active: true,
        ownerCompanyId: true,
        ownerCompany: { select: { id: true, name: true } },
      },
    });
  }

  async deleteWarehouse(warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true },
    });
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    try {
      return await this.prisma.warehouse.delete({ where: { id: warehouseId } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new BadRequestException('Warehouse has related records');
      }
      throw error;
    }
  }
}
