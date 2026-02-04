import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async listEmployees() {
    const employees = await this.prisma.employee.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        role: true,
        phone: true,
        email: true,
        documentId: true,
        active: true,
        createdAt: true,
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
    role: string;
    phone?: string;
    email?: string;
    documentId?: string;
    vehicleIds?: string[];
  }) {
    const vehicleIds = payload.vehicleIds ?? [];
    if (vehicleIds.length) {
      await this.assertVehiclesExist(vehicleIds);
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          name: payload.name,
          role: payload.role as any,
          phone: payload.phone ?? null,
          email: payload.email ?? null,
          documentId: payload.documentId ?? null,
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
  }

  async updateEmployee(
    employeeId: string,
    payload: {
      name?: string;
      role?: string;
      phone?: string;
      email?: string;
      documentId?: string;
      active?: boolean;
      vehicleIds?: string[];
    },
  ) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const vehicleIds = payload.vehicleIds;
    if (vehicleIds && vehicleIds.length) {
      await this.assertVehiclesExist(vehicleIds);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id: employeeId },
        data: {
          name: payload.name,
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
  }

  async deleteEmployee(employeeId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.employeeVehicle.deleteMany({ where: { employeeId } });
      await tx.employee.delete({ where: { id: employeeId } });
      return { deleted: true };
    });
  }

  private async assertVehiclesExist(vehicleIds: string[]) {
    const unique = [...new Set(vehicleIds)];
    const count = await this.prisma.vehicle.count({ where: { id: { in: unique } } });
    if (count !== unique.length) {
      throw new BadRequestException('One or more vehicleIds are invalid');
    }
  }
}
