import { Injectable } from '@nestjs/common';
import { TrackingAddressStoreService } from '../tracking/tracking-address-store.service';
import { validateGoogleAddress } from './google-address-validation';
import type { WorksiteAddressValidationParams } from './google-address-validation';

@Injectable()
export class WorksiteAddressValidationService {
 constructor(private readonly locations?: TrackingAddressStoreService) {}
 async validate(params: WorksiteAddressValidationParams) {
  const result = await validateGoogleAddress(params);
  let mapLocationStatus = 'pending';
  if (this.locations) {
   try { mapLocationStatus = await this.locations.rememberValidatedAddress(result.inputAddress, result.formattedAddress, result); }
   catch { mapLocationStatus = 'error'; }
  }
  return { ...result, mapLocationStatus };
 }
}
