import { BadRequestException } from '@nestjs/common';

export function validateRentalQuantityBasis(basis: string, chargeType: string, controlType: string, areaM2: unknown) {
  if (basis === 'UNIT') return;
  if (basis !== 'AREA_M2') throw new BadRequestException('Base de cobro inválida');
  if (chargeType !== 'DAY' || controlType !== 'BULK')
    throw new BadRequestException('El cobro por m² requiere una referencia bulk con alquiler por día');
  const area = Number(areaM2);
  if (!Number.isFinite(area) || area <= 0 || area > 9999999999 || Math.abs(area * 1e6 - Math.round(area * 1e6)) > 0.001)
    throw new BadRequestException('Configura un área por pieza mayor que cero, con máximo seis decimales');
}
