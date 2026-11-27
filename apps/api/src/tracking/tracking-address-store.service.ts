import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { validateGoogleAddress } from '../customers/google-address-validation';
import { groupAddresses, googleAddressPoint, automaticAddressParams } from './tracking-addresses';
import type { GoogleAddressResult } from './tracking-addresses';

@Injectable()
export class TrackingAddressStoreService {
 private retryAt=0;
 constructor(private readonly prisma: PrismaService) {}
 enabled() { return process.env.TRACKING_CUSTOMER_GEOCODING_ENABLED==='true' && Boolean(process.env.GOOGLE_MAPS_API_KEY); }
 async rememberValidatedAddress(inputAddress: string, formattedAddress: string, result: GoogleAddressResult) {
  const group=groupAddresses([{address:formattedAddress,name:'address'}])[0];
  if (!group) return 'needs_review';
  const point=googleAddressPoint(result);
  const data={status:point?.precise?'located':'needs_review',latitude:point?.latitude ?? null,longitude:point?.longitude ?? null,
   precision:point?.precision ?? null,placeId:result.placeId ?? null,resolvedAddress:formattedAddress,
   provider:'google-address-validation',expiresAt:new Date(Date.now()+30*86400_000),retryAfter:null};
  await this.prisma.trackingAddressLocation.upsert({where:{key:group.key},create:{key:group.key,address:formattedAddress,...data},update:data});
  const alias=groupAddresses([{address:inputAddress,name:'address'}])[0];
  if (alias && alias.key!==group.key) await this.prisma.trackingAddressLocation.upsert({where:{key:alias.key},create:{key:alias.key,address:inputAddress,canonicalKey:group.key,...data},update:{canonicalKey:group.key,...data}});
  return data.status;
 }
 async resolve(address: string) {
  const group=groupAddresses([{address,name:'address'}])[0];
  if (!group) return null;
  let row=await this.prisma.trackingAddressLocation.upsert({where:{key:group.key},create:{key:group.key,address},update:{}});
  if (!this.enabled() || ['located','needs_review'].includes(row.status) || row.attempts>=3 || Date.now()<this.retryAt) return row;
  const now=new Date();
  const claim=await this.prisma.trackingAddressLocation.updateMany({where:{key:group.key,attempts:{lt:3},OR:[{status:'pending'},{status:'error',retryAfter:{lte:now}},{status:'processing',lastAttemptAt:{lt:new Date(now.getTime()-120_000)}}]},data:{status:'processing',lastAttemptAt:now,attempts:{increment:1}}});
  if (!claim.count) return row;
  try {
   const params=automaticAddressParams(address);
   if (!params) return this.prisma.trackingAddressLocation.update({where:{key:group.key},data:{status:'needs_review',latitude:null,longitude:null}});
   const result=await validateGoogleAddress(params);
   await this.rememberValidatedAddress(address,result.formattedAddress,result);
   return this.prisma.trackingAddressLocation.findUnique({where:{key:group.key}});
  } catch (e) {
   if (e?.getStatus?.()===503) this.retryAt=Date.now()+15*60_000;
   return this.prisma.trackingAddressLocation.update({where:{key:group.key},data:{status:e?.getStatus?.()===400?'needs_review':'error',provider:'google-address-validation',retryAfter:new Date(Date.now()+86400_000)}});
  }
 }
}
