import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingAddressStoreService } from './tracking-address-store.service';
import { groupAddresses, customerMapPlaces, mergeCustomerPlaces, usableLocation } from './tracking-addresses';

@Injectable()
export class TrackingLocationsService implements OnModuleInit, OnModuleDestroy {
 private readonly logger = new Logger(TrackingLocationsService.name);
 private timer?: ReturnType<typeof setInterval>;
 private running = false;
 private stopped = false;
 private value = { places:[] as ReturnType<typeof customerMapPlaces>, summary:{total:0,located:0,pending:0,needsReview:0,errors:0,geocodingEnabled:false} };
 constructor(private readonly prisma: PrismaService, private readonly store: TrackingAddressStoreService) {}
 onModuleInit() {
  void this.refresh();
  this.timer = setInterval(()=>void this.refresh(),60_000); this.timer.unref();
 }
 onModuleDestroy() { this.stopped=true; clearInterval(this.timer); }
 snapshot() { return this.value; }
 async refresh() {
  if (this.running || this.stopped) return;
  this.running=true;
  try {
   // Google coordinate caching is limited to 30 days. Keep identifiers, discard
   // expired geometry and refresh only through the shared recovery pipeline.
   await this.prisma.trackingAddressLocation.updateMany({where:{provider:'google-address-validation',expiresAt:{lte:new Date()}},
    data:{status:'pending',latitude:null,longitude:null,resolvedAddress:null,expiresAt:null,attempts:0}});
   const [customers, worksites] = await Promise.all([
    this.prisma.customer.findMany({where:{active:true,billingAddress:{not:null}},select:{name:true,billingAddress:true}}),
    this.prisma.worksite.findMany({where:{active:true,address:{not:null},customerWorksites:{some:{active:true,customer:{active:true}}}},
     select:{name:true,address:true,attendanceLatitude:true,attendanceLongitude:true,customerWorksites:{where:{active:true,customer:{active:true}},select:{alias:true,customer:{select:{name:true}}}}}}),
   ]);
   const groups = groupAddresses([
    ...customers.map(c=>({address:c.billingAddress!,name:c.name})),
    ...worksites.map(w=>({address:w.address!,name:w.customerWorksites.map(link=>`${link.customer.name} · ${link.alias || w.name}`).join(' / '),latitude:w.attendanceLatitude,longitude:w.attendanceLongitude})),
   ]);
   if (!groups.length) { this.value={...this.value,places:[],summary:{...this.value.summary,total:0,located:0,pending:0,needsReview:0,errors:0}}; return; }
   await this.prisma.trackingAddressLocation.createMany({data:groups.map(g=>({key:g.key,address:g.address})),skipDuplicates:true});
   const rows = await this.prisma.trackingAddressLocation.findMany({where:{key:{in:groups.map(g=>g.key)}}});
   const enabled=this.store.enabled();
   const project=()=>{
    const places=customerMapPlaces(groups,rows),located=new Set(places.map(p=>p.id));
    const unresolved=rows.filter(row=>!located.has(-(parseInt(row.key.slice(0,12),16)+1)));
    this.value={places:mergeCustomerPlaces(places),summary:{total:groups.length,located:places.length,pending:unresolved.filter(r=>['pending','processing'].includes(r.status)).length,
     needsReview:rows.filter(r=>r.status==='needs_review').length,errors:unresolved.filter(r=>r.status==='error').length,geocodingEnabled:enabled}};
   };
   project();
   for (const group of groups) {
    if (this.stopped || !enabled) break;
    const row=rows.find(r=>r.key===group.key)!;
    if (usableLocation(group.latitude,group.longitude) || row.status==='located' || row.status==='needs_review') continue;
    const result=await this.store.resolve(group.address);
    if (result) Object.assign(row,result);
    project();
    if (result?.status==='error') break;
   }
  } catch { this.logger.warn('No se pudo sincronizar las ubicaciones de clientes. Se conservan los puntos disponibles.'); }
  finally { this.running=false; }
 }
}
