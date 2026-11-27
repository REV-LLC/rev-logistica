import { createHash } from 'node:crypto';
export type AddressSource = { address: string; name: string; latitude?: number | null; longitude?: number | null };
export type AddressGroup = { key: string; address: string; names: string[]; latitude: number | null; longitude: number | null };
export function normalizedAddress(value: string) {
 return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
  .replace(/\b(CRA|CR|KR|KRA)\b/g,'CARRERA').replace(/\b(CL|CLL)\b/g,'CALLE')
  .replace(/[^A-Z0-9]+/g,' ').trim();
}
export function usableLocation(latitude: unknown, longitude: unknown) {
 return typeof latitude === 'number' && typeof longitude === 'number' && Number.isFinite(latitude) && Number.isFinite(longitude)
  && latitude >= -5 && latitude <= 14 && longitude >= -82 && longitude <= -66;
}
export function groupAddresses(sources: AddressSource[]): AddressGroup[] {
 const groups = new Map<string, AddressGroup>();
 for (const source of sources) {
  const address = source.address?.trim(), normalized = address && normalizedAddress(address);
  if (!normalized || !source.name?.trim()) continue;
  const key = createHash('sha256').update(`CO:${normalized}`).digest('hex');
  let group = groups.get(key);
  if (!group) { group = { key, address, names:[], latitude:null, longitude:null }; groups.set(key,group); }
  if (!group.names.includes(source.name.trim())) group.names.push(source.name.trim());
  if (usableLocation(source.latitude, source.longitude)) { group.latitude = source.latitude!; group.longitude = source.longitude!; }
 }
 return [...groups.values()];
}
export type GoogleAddressResult = { countryCode?: string | null; placeId?: string | null; formattedAddress: string;
 location: {lat:number;lng:number} | null; verdict: {geocodeGranularity?:string|null;hasUnconfirmedComponents?:boolean} };
export function googleAddressPoint(result: GoogleAddressResult) {
 const granularity=result.verdict.geocodeGranularity;
 if (result.countryCode !== 'CO' || !result.location || !usableLocation(result.location.lat,result.location.lng)) return null;
 return {latitude:result.location.lat,longitude:result.location.lng,
  precise:['SUB_PREMISE','PREMISE','PREMISE_PROXIMITY'].includes(granularity || ''),precision:granularity || null};
}
export function customerMapPlaces(groups: AddressGroup[], rows: {key:string;status:string;latitude:number|null;longitude:number|null}[]) {
 const stored = new Map(rows.map(row=>[row.key,row]));
 return groups.flatMap(group=>{
  const row = stored.get(group.key);
  const point = usableLocation(group.latitude,group.longitude) ? group : row && ['located','needs_review'].includes(row.status) ? row : null;
  if (!point || !usableLocation(point.latitude,point.longitude)) return [];
  return [{id:-(parseInt(group.key.slice(0,12),16)+1), name:group.names.join(' · '), address:group.address,
   latitude:point.latitude!,longitude:point.longitude!,radiusMeters:50,siteType:'customer',approximate:point===row && row.status==='needs_review'}];
 });
}

export function mergeCustomerPlaces(places: ReturnType<typeof customerMapPlaces>) {
 const points = new Map<string, (typeof places)[number]>();
 for (const place of places) {
  const key=`${place.latitude.toFixed(6)}:${place.longitude.toFixed(6)}`;
  const previous=points.get(key);
  if (!previous) { points.set(key,{...place}); continue; }
  previous.id=Math.min(previous.id,place.id);
  previous.name=[...new Set([...previous.name.split(' · '),...place.name.split(' · ')])].join(' · ');
  previous.approximate ||= place.approximate;
 }
 return [...points.values()];
}
