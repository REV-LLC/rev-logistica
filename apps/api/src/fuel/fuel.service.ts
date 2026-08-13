import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssetFuelingDto } from './dto/create-asset-fueling.dto';
import { CreateVehicleFuelingDto } from './dto/create-vehicle-fueling.dto';
import { CreateWorksiteFuelReceiptDto } from './dto/create-worksite-fuel-receipt.dto';

@Injectable()
export class FuelService {
  constructor(private readonly prisma: PrismaService) {}

  async getOptions() {
    const [worksites, assets, vehicles, employees] = await Promise.all([
      this.prisma.worksite.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      this.prisma.asset.findMany({
        where: { active: true },
        orderBy: { publicCode: 'asc' },
        select: {
          id: true,
          publicCode: true,
          serialOrEngine: true,
          description: true,
          sku: { select: { name: true } },
        },
      }),
      this.prisma.vehicle.findMany({
        where: { active: true },
        orderBy: { plate: 'asc' },
        select: { id: true, plate: true, brand: true, model: true },
      }),
      this.prisma.employee.findMany({
        where: {
          active: true,
          role: { in: ['DRIVER', 'HEAVY_MACHINERY_OPERATOR', 'MACHINIST'] },
        },
        orderBy: [{ name: 'asc' }, { lastName: 'asc' }],
        select: { id: true, name: true, lastName: true, role: true },
      }),
    ]);
    return { worksites, assets, vehicles, employees };
  }

  async getDashboard() {
    const [worksites, receipts, usedByWorksite, assetFuelings, vehicleFuelings] = await Promise.all([
      this.prisma.worksite.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      this.prisma.worksiteFuelReceipt.groupBy({
        by: ['worksiteId'],
        _sum: { quantityCans: true },
      }),
      this.prisma.assetFueling.groupBy({
        by: ['worksiteId'],
        _sum: { quantityCans: true },
      }),
      this.prisma.assetFueling.findMany({
        orderBy: [{ fueledAt: 'desc' }, { createdAt: 'desc' }],
        take: 100,
        include: {
          worksite: { select: { id: true, name: true } },
          asset: {
            select: {
              id: true,
              publicCode: true,
              serialOrEngine: true,
              description: true,
              sku: { select: { name: true } },
            },
          },
          operator: { select: { id: true, name: true, lastName: true } },
        },
      }),
      this.prisma.vehicleFueling.findMany({
        orderBy: [{ fueledAt: 'desc' }, { createdAt: 'desc' }],
        take: 100,
        include: {
          vehicle: {
            select: { id: true, plate: true, brand: true, model: true },
          },
          driver: { select: { id: true, name: true, lastName: true } },
        },
      }),
    ]);

    const received = new Map(receipts.map((row) => [row.worksiteId, Number(row._sum.quantityCans ?? 0)]));
    const used = new Map(usedByWorksite.map((row) => [row.worksiteId, Number(row._sum.quantityCans ?? 0)]));

    const assetMetrics = this.withAssetMetrics(assetFuelings);
    const vehicleMetrics = this.withVehicleMetrics(vehicleFuelings);

    return {
      worksiteBalances: worksites
        .map((worksite) => ({
          ...worksite,
          receivedCans: received.get(worksite.id) ?? 0,
          usedCans: used.get(worksite.id) ?? 0,
          availableCans: (received.get(worksite.id) ?? 0) - (used.get(worksite.id) ?? 0),
        }))
        .filter((row) => row.receivedCans !== 0 || row.usedCans !== 0),
      recentAssetFuelings: assetMetrics.slice(0, 20),
      recentVehicleFuelings: vehicleMetrics.slice(0, 20),
    };
  }

  async createWorksiteReceipt(body: CreateWorksiteFuelReceiptDto, userId: string) {
    this.assertHalfCanIncrement(body.quantityCans);
    await this.assertWorksite(body.worksiteId);
    return this.prisma.worksiteFuelReceipt.create({
      data: {
        worksiteId: body.worksiteId,
        receivedAt: new Date(body.receivedAt),
        quantityCans: body.quantityCans,
        notes: body.notes,
        createdBy: userId,
      },
    });
  }

  async createAssetFueling(body: CreateAssetFuelingDto, userId: string) {
    this.assertHalfCanIncrement(body.quantityCans);
    const fueledAt = new Date(body.fueledAt);

    return this.prisma.$transaction(
      async (tx) => {
        const [worksite, asset, operator, totals, previous, next] = await Promise.all([
          tx.worksite.findFirst({
            where: { id: body.worksiteId, active: true },
            select: { id: true },
          }),
          tx.asset.findFirst({
            where: { id: body.assetId, active: true },
            select: { id: true },
          }),
          body.operatorEmployeeId
            ? tx.employee.findFirst({
                where: { id: body.operatorEmployeeId, active: true },
                select: { id: true },
              })
            : Promise.resolve(null),
          Promise.all([
            tx.worksiteFuelReceipt.aggregate({
              where: { worksiteId: body.worksiteId },
              _sum: { quantityCans: true },
            }),
            tx.assetFueling.aggregate({
              where: { worksiteId: body.worksiteId },
              _sum: { quantityCans: true },
            }),
          ]),
          tx.assetFueling.findFirst({
            where: { assetId: body.assetId, fueledAt: { lte: fueledAt } },
            orderBy: { fueledAt: 'desc' },
            select: { hourMeter: true },
          }),
          tx.assetFueling.findFirst({
            where: { assetId: body.assetId, fueledAt: { gt: fueledAt } },
            orderBy: { fueledAt: 'asc' },
            select: { hourMeter: true },
          }),
        ]);
        if (!worksite) throw new NotFoundException('Obra no encontrada');
        if (!asset) throw new NotFoundException('Asset no encontrado');
        if (body.operatorEmployeeId && !operator) throw new NotFoundException('Operador no encontrado');
        const available = Number(totals[0]._sum.quantityCans ?? 0) - Number(totals[1]._sum.quantityCans ?? 0);
        if (body.quantityCans > available) throw new BadRequestException(`Saldo insuficiente en la obra. Disponible: ${available} tarros`);
        this.assertMeterSequence(body.hourMeter, previous?.hourMeter, next?.hourMeter, 'horómetro');

        return tx.assetFueling.create({
          data: {
            worksiteId: body.worksiteId,
            assetId: body.assetId,
            fueledAt,
            quantityCans: body.quantityCans,
            hourMeter: body.hourMeter,
            operatorEmployeeId: body.operatorEmployeeId,
            notes: body.notes,
            createdBy: userId,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async createVehicleFueling(body: CreateVehicleFuelingDto, userId: string) {
    const fueledAt = new Date(body.fueledAt);
    const [vehicle, driver, previous, next] = await Promise.all([
      this.prisma.vehicle.findFirst({
        where: { id: body.vehicleId, active: true },
        select: { id: true },
      }),
      body.driverEmployeeId
        ? this.prisma.employee.findFirst({
            where: { id: body.driverEmployeeId, active: true },
            select: { id: true },
          })
        : Promise.resolve(null),
      this.prisma.vehicleFueling.findFirst({
        where: { vehicleId: body.vehicleId, fueledAt: { lte: fueledAt } },
        orderBy: { fueledAt: 'desc' },
        select: { odometerKm: true },
      }),
      this.prisma.vehicleFueling.findFirst({
        where: { vehicleId: body.vehicleId, fueledAt: { gt: fueledAt } },
        orderBy: { fueledAt: 'asc' },
        select: { odometerKm: true },
      }),
    ]);
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado');
    if (body.driverEmployeeId && !driver) throw new NotFoundException('Conductor no encontrado');
    this.assertMeterSequence(body.odometerKm, previous?.odometerKm, next?.odometerKm, 'kilometraje');

    return this.prisma.vehicleFueling.create({
      data: {
        vehicleId: body.vehicleId,
        fueledAt,
        quantityGallons: body.quantityGallons,
        odometerKm: body.odometerKm,
        fullTank: body.fullTank ?? false,
        totalCost: body.totalCost,
        supplier: body.supplier,
        invoiceNumber: body.invoiceNumber,
        driverEmployeeId: body.driverEmployeeId,
        notes: body.notes,
        createdBy: userId,
      },
    });
  }

  private async assertWorksite(id: string) {
    const worksite = await this.prisma.worksite.findFirst({
      where: { id, active: true },
      select: { id: true },
    });
    if (!worksite) throw new NotFoundException('Obra no encontrada');
  }

  private assertHalfCanIncrement(value: number) {
    if (!Number.isInteger(value * 2)) throw new BadRequestException('Los tarros deben registrarse en incrementos de medio tarro');
  }

  private assertMeterSequence(value: number, previous?: Prisma.Decimal, next?: Prisma.Decimal, label = 'medidor') {
    if (previous !== undefined && value < Number(previous)) throw new BadRequestException(`La lectura del ${label} no puede ser menor que la anterior`);
    if (next !== undefined && value > Number(next)) throw new BadRequestException(`La lectura del ${label} no puede superar una lectura posterior`);
  }

  private withAssetMetrics<
    T extends {
      assetId: string;
      hourMeter: Prisma.Decimal;
      quantityCans: Prisma.Decimal;
      fueledAt: Date;
    },
  >(rows: T[]) {
    const chronological = [...rows].sort((a, b) => a.fueledAt.getTime() - b.fueledAt.getTime());
    const previousById = new Map<T, T>();
    const latest = new Map<string, T>();
    for (const row of chronological) {
      const previous = latest.get(row.assetId);
      if (previous) previousById.set(row, previous);
      latest.set(row.assetId, row);
    }
    return rows.map((row) => {
      const previous = previousById.get(row);
      const hoursSincePrevious = previous ? Number(row.hourMeter) - Number(previous.hourMeter) : null;
      return {
        ...row,
        quantityCans: Number(row.quantityCans),
        hourMeter: Number(row.hourMeter),
        hoursSincePrevious,
        cansPerHour: hoursSincePrevious && hoursSincePrevious > 0 ? Number(row.quantityCans) / hoursSincePrevious : null,
      };
    });
  }

  private withVehicleMetrics<
    T extends {
      vehicleId: string;
      odometerKm: Prisma.Decimal;
      quantityGallons: Prisma.Decimal;
      totalCost: Prisma.Decimal | null;
      fullTank: boolean;
      fueledAt: Date;
    },
  >(rows: T[]) {
    const chronological = [...rows].sort((a, b) => a.fueledAt.getTime() - b.fueledAt.getTime());
    const previousFullByRow = new Map<T, T>();
    const latestFull = new Map<string, T>();
    for (const row of chronological) {
      const previous = latestFull.get(row.vehicleId);
      if (row.fullTank && previous) previousFullByRow.set(row, previous);
      if (row.fullTank) latestFull.set(row.vehicleId, row);
    }
    return rows.map((row) => {
      const previous = previousFullByRow.get(row);
      const distanceKm = previous ? Number(row.odometerKm) - Number(previous.odometerKm) : null;
      return {
        ...row,
        quantityGallons: Number(row.quantityGallons),
        odometerKm: Number(row.odometerKm),
        totalCost: row.totalCost === null ? null : Number(row.totalCost),
        distanceKm,
        kmPerGallon: distanceKm && distanceKm > 0 ? distanceKm / Number(row.quantityGallons) : null,
      };
    });
  }
}
