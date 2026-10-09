import { BadRequestException } from '@nestjs/common';

/** Function and inventory control are independent. Never convert existing stock here. */
export function validateImplementClassification(controlType: string, isImplement: boolean, isConsumable: boolean) {
  if (isConsumable && !isImplement)
    throw new BadRequestException('Un consumible debe estar clasificado como implemento.');
  if (isConsumable && controlType !== 'BULK')
    throw new BadRequestException('Un implemento consumible se registra por cantidad (bulk), no como un asset individual.');
  // BULK identifies a quantity, not consumption. Returnable implements may
  // use BULK too; their stock must remain pending until it is returned.
}
