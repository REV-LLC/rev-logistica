import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AnnexInput } from './annex-input';
import { validateRentalQuantityBasis } from '../skus/rental-quantity-basis';

type CatalogBasis = { id: string; rentalQuantityBasis: string; chargeType: string; areaM2: Prisma.Decimal | null };
export function applyCatalogQuantityBasis(rentals: AnnexInput['rentals'], catalog: CatalogBasis[]) {
  const byId = new Map(catalog.map(sku => [sku.id, sku]));
  for (const rental of rentals) {
    const sku = byId.get(rental.skuId);
    // Dimensions never select a commercial basis. Only an explicit catalog choice does.
    if (!sku || sku.rentalQuantityBasis !== 'AREA_M2') continue;
    validateRentalQuantityBasis(sku.rentalQuantityBasis, sku.chargeType, rental.assetId ? 'SERIAL' : 'BULK', sku.areaM2);
    if (rental.commercial || rental.includedIn || rental.metering || rental.cutting)
      throw new BadRequestException(`${rental.label}: concilia la modalidad comercial antes de cambiar el cobro a m²`);
    rental.billingAreaM2 = sku.areaM2!.toString();
  }
}
