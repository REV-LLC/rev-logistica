import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  private toDateOrNull(value?: string | null) {
    if (!value) return null;
    const normalized = value.length === 10 ? `${value}T00:00:00.000Z` : value;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  async listVehicles() {
    const vehicles = await this.prisma.vehicle.findMany({
      orderBy: { plate: 'asc' },
      select: {
        id: true,
        plate: true,
        brand: true,
        model: true,
        year: true,
        type: true,
        capacity: true,
        soatVigencia: true,
        tecnomecanicaVigencia: true,
        active: true,
        createdAt: true,
        drivers: {
          select: {
            employee: {
              select: {
                id: true,
                name: true,
                role: true,
                phone: true,
                email: true,
                active: true,
              },
            },
          },
        },
      },
    });

    return vehicles.map((vehicle) => ({
      ...vehicle,
      drivers: vehicle.drivers.map((entry) => entry.employee),
    }));
  }

  async createVehicle(payload: {
    plate: string;
    brand?: string;
    model?: string;
    year?: number;
    type?: string;
    capacity?: string;
    soatVigencia?: string;
    tecnomecanicaVigencia?: string;
    driverIds?: string[];
  }) {
    const driverIds = payload.driverIds ?? [];
    if (driverIds.length) {
      await this.assertEmployeesExist(driverIds);
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.vehicle.create({
        data: {
          plate: payload.plate,
          brand: payload.brand ?? null,
          model: payload.model ?? null,
          year: payload.year ?? null,
          type: payload.type ?? null,
          capacity: payload.capacity ?? null,
          soatVigencia: this.toDateOrNull(payload.soatVigencia),
          tecnomecanicaVigencia: this.toDateOrNull(payload.tecnomecanicaVigencia),
        },
      });

      if (driverIds.length) {
        await tx.employeeVehicle.createMany({
          data: driverIds.map((employeeId) => ({
            employeeId,
            vehicleId: created.id,
          })),
        });
      }

      return created;
    });
  }

  async updateVehicle(
    vehicleId: string,
    payload: {
      plate?: string;
      brand?: string;
      model?: string;
      year?: number;
      type?: string;
      capacity?: string;
      soatVigencia?: string;
      tecnomecanicaVigencia?: string;
      active?: boolean;
      driverIds?: string[];
    },
  ) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const driverIds = payload.driverIds;
    if (driverIds && driverIds.length) {
      await this.assertEmployeesExist(driverIds);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.vehicle.update({
        where: { id: vehicleId },
        data: {
          plate: payload.plate,
          brand: payload.brand,
          model: payload.model,
          year: payload.year,
          type: payload.type,
          capacity: payload.capacity,
          soatVigencia: this.toDateOrNull(payload.soatVigencia),
          tecnomecanicaVigencia: this.toDateOrNull(payload.tecnomecanicaVigencia),
          active: payload.active,
        },
      });

      if (driverIds) {
        await tx.employeeVehicle.deleteMany({ where: { vehicleId } });
        if (driverIds.length) {
          await tx.employeeVehicle.createMany({
            data: driverIds.map((employeeId) => ({
              employeeId,
              vehicleId,
            })),
          });
        }
      }

      return updated;
    });
  }

  async deleteVehicle(vehicleId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.employeeVehicle.deleteMany({ where: { vehicleId } });
      await tx.vehicle.delete({ where: { id: vehicleId } });
      return { deleted: true };
    });
  }

  private async assertEmployeesExist(employeeIds: string[]) {
    const unique = [...new Set(employeeIds)];
    const count = await this.prisma.employee.count({ where: { id: { in: unique } } });
    if (count !== unique.length) {
      throw new BadRequestException('One or more driverIds are invalid');
    }
  }
}
