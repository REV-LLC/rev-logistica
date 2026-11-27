import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { groupAddresses, permanentAddressResult } from './tracking-addresses';

// Shared by the existing validation flow and the background recovery. Coordinates
// come from permanent geocoding, not from Google's temporary validation preview.
@Injectable()
export class TrackingAddressStoreService {
 private retryAt=0;
 constructor(private readonly prisma: PrismaService) {}
 enabled() { return process.env.TRACKING_CUSTOMER_GEOCODING_ENABLED==='true' && Boolean(process.env.TRACKING_GEOCODING_TOKEN || process.env.MAPBOX_ACCESS_TOKEN); }
 async rememberValidatedAddress(inputAddress: string, formattedAddress: string) {
  const result=await this.resolve(formattedAddress);
  if (result) {
   const alias=groupAddresses([{address:inputAddress,name:'address'}])[0];
   if (alias && alias.key!==result.key) await this.prisma.trackingAddressLocation.upsert({where:{key:alias.key},
    create:{key:alias.key,address:inputAddress,canonicalKey:result.key,status:['located','needs_review'].includes(result.status)?result.status:'pending',latitude:result.latitude,longitude:result.longitude,resolvedAddress:result.resolvedAddress,provider:result.provider},
    update:{canonicalKey:result.key,...(result.status==='located'?{status:'located',latitude:result.latitude,longitude:result.longitude,resolvedAddress:result.resolvedAddress,provider:result.provider,retryAfter:null}:{})}});
  }
  return result?.status || 'pending';
 }
 async resolve(address: string, visited = new Set<string>()) {
  const group=groupAddresses([{address,name:'address'}])[0];
  if (!group || visited.has(group.key)) return null;
  visited.add(group.key);
  let row=await this.prisma.trackingAddressLocation.upsert({where:{key:group.key},create:{key:group.key,address},update:{}});
  if (row.canonicalKey && row.canonicalKey!==row.key && this.enabled()) {
   const canonical=await this.prisma.trackingAddressLocation.findUnique({where:{key:row.canonicalKey}});
   const result=canonical && await this.resolve(canonical.address,visited);
   if (result?.status==='located') return this.prisma.trackingAddressLocation.update({where:{key:row.key},data:{status:'located',latitude:result.latitude,longitude:result.longitude,resolvedAddress:result.resolvedAddress,provider:result.provider,retryAfter:null}});
   if (result?.status==='needs_review') return this.prisma.trackingAddressLocation.update({where:{key:row.key},data:{status:'needs_review'}});
   return row;
  }
  if (!this.enabled() || row.status==='located' || row.status==='needs_review' || row.attempts>=3 || Date.now()<this.retryAt) return row;
  const now=new Date();
  const claim=await this.prisma.trackingAddressLocation.updateMany({where:{key:group.key,attempts:{lt:3},OR:[{status:'pending'},{status:'error',retryAfter:{lte:now}},{status:'processing',lastAttemptAt:{lt:new Date(now.getTime()-120_000)}}]},data:{status:'processing',lastAttemptAt:now,attempts:{increment:1}}});
  if (!claim.count) return row;
  let update: {status:string;provider:string;latitude?:number;longitude?:number;resolvedAddress?:string;retryAfter:Date|null};
  try {
   if (address.length>256 || address.split(/\s+/).length>20) {
    update={status:'needs_review',provider:'mapbox-permanent',retryAfter:null};
   } else {
    const token=process.env.TRACKING_GEOCODING_TOKEN || process.env.MAPBOX_ACCESS_TOKEN;
    const query=new URLSearchParams({q:address,country:'co',types:'address',autocomplete:'false',permanent:'true',language:'es',limit:'5',access_token:token!});
    const response=await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${query}`,{signal:AbortSignal.timeout(8000),redirect:'error'});
    if (!response.ok) { this.retryAt=Date.now()+([401,403].includes(response.status)?86400_000:15*60_000); throw new Error('Geocoder unavailable'); }
    const result=permanentAddressResult(await response.json());
    update=result?{status:'located',provider:'mapbox-permanent',...result,retryAfter:null}:{status:'needs_review',provider:'mapbox-permanent',retryAfter:null};
   }
  } catch { update={status:'error',provider:'mapbox-permanent',retryAfter:new Date(Date.now()+86400_000)}; }
  return this.prisma.trackingAddressLocation.update({where:{key:group.key},data:update});
 }
}
