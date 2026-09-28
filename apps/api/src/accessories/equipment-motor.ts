import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MotorDetailsDto } from './dto/equipment-motors.dto';

export const motorInclude = {
  assignedMotor: {
    select: {
      id: true,
      publicCode: true,
      internalNumber: true,
      serialOrEngine: true,
      fuel: true,
      description: true,
      sku: { select: { name: true } },
    },
  },
} satisfies Prisma.AssetInclude;
type Parent = Prisma.AssetGetPayload<{ include: typeof motorInclude }>;

export function motorSnapshot(asset: Parent) {
  return {
    configuration: asset.motorConfiguration,
    assignedMotorId: asset.assignedMotorId,
    assignedMotor: asset.assignedMotor,
    canConfigure: asset.kind !== 'MOTOR',
  };
}

export async function createEquipmentMotor(
  tx: Prisma.TransactionClient,
  parent: Parent,
  input: Pick<MotorDetailsDto, 'fuel' | 'brand' | 'model'> & {
    powerHp?: number;
    serialOrEngine?: string;
  },
  userId: string,
) {
  if (!parent.warehouseCurrentId)
    throw new BadRequestException(
      'El equipo debe estar en una bodega para registrar un motor nuevo.',
    );
  if (!['ELECTRICO', 'GASOLINA'].includes(input.fuel))
    throw new BadRequestException('Selecciona el combustible del motor.');
  const family = await tx.assetFamily.upsert({
    where: { code: 'MOTORES' },
    update: {},
    create: { code: 'MOTORES', name: 'MOTORES', controlType: 'SERIAL' },
  });
  const subfamily = await tx.assetSubfamily.upsert({
    where: {
      assetFamilyId_code: {
        assetFamilyId: family.id,
        code: `MOTOR_${input.fuel}`,
      },
    },
    update: {},
    create: {
      assetFamilyId: family.id,
      code: `MOTOR_${input.fuel}`,
      name: `MOTOR ${input.fuel === 'ELECTRICO' ? 'ELÉCTRICO' : 'GASOLINA'}`,
    },
  });
  const name =
    [
      input.brand?.trim(),
      input.powerHp ? `${input.powerHp} HP` : '',
      input.model?.trim(),
    ]
      .filter(Boolean)
      .join(' ') || subfamily.name;
  const catalogName = `${name} · ${input.fuel === 'ELECTRICO' ? 'ELÉCTRICO' : 'GASOLINA'}`;
  const sku = await tx.sku.upsert({
    where: {
      assetFamilyId_name: { assetFamilyId: family.id, name: catalogName },
    },
    update: {},
    create: {
      assetFamilyId: family.id,
      assetSubfamilyId: subfamily.id,
      name: catalogName,
      chargeType: 'DAY',
    },
  });
  if (sku.assetSubfamilyId !== subfamily.id)
    throw new BadRequestException(
      'Ese nombre de motor pertenece a otro combustible. Usa una referencia distinta.',
    );
  const counter = await tx.assetInternalCounter.upsert({
    where: {
      ownerWarehouseId_assetSubfamilyId: {
        ownerWarehouseId: parent.warehouseOwnerId,
        assetSubfamilyId: subfamily.id,
      },
    },
    create: {
      ownerWarehouseId: parent.warehouseOwnerId,
      assetSubfamilyId: subfamily.id,
      nextNumber: 2,
    },
    update: { nextNumber: { increment: 1 } },
  });
  const internalNumber = counter.nextNumber - 1;
  const motor = await tx.asset.create({
    data: {
      skuId: sku.id,
      kind: 'MOTOR',
      internalNumber,
      publicCode: `MOTORES-${subfamily.code}-${parent.warehouseOwnerId}-${String(internalNumber).padStart(4, '0')}`,
      motorPowerHp: input.powerHp ?? null,
      description: name,
      fuel: input.fuel,
      brand: input.brand?.trim() || null,
      model: input.model?.trim() || null,
      serialOrEngine: input.serialOrEngine?.trim() || null,
      warehouseOwnerId: parent.warehouseOwnerId,
      warehouseCurrentId: parent.warehouseCurrentId,
    },
  });
  await tx.stockLedger.create({
    data: {
      movementType: 'ADJUST',
      warehouseId: parent.warehouseCurrentId,
      ownerWarehouseId: parent.warehouseOwnerId,
      assetId: motor.id,
      quantity: 1,
      isOpeningBalance: true,
      createdBy: userId,
    },
  });
  return motor.id;
}
