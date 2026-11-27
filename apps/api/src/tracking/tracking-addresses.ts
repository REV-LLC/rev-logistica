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
// Automatic recovery is local to REV's operating area. Never let Google choose
// another Colombian city for a bare street number or an incomplete address.
const localities = ['Cali','Yumbo','Palmira','Jamundí','Candelaria','Pradera','Tuluá','Dagua'];
export function automaticAddressParams(address: string) {
 const normalized = normalizedAddress(address);
 if (/\b(NN|NS|PNDT|FALTA)\b|HTTPS/.test(normalized) || (address.match(/\d+/g) || []).length < 3) return null;
 const parts = address.split(',').slice(1).map(normalizedAddress);
 const city = localities.find(name => parts.includes(normalizedAddress(name)));
 // Explicit foreign departments/cities need review rather than being silently
 // rewritten to Cali. Existing corrections are reviewed separately.
 if (!city && parts.length && !parts.every(part => /^(VALLE DEL CAUCA|COLOMBIA|CO|[0-9]+)$/.test(part))) return null;
 return { address, city:city || 'Cali', department:'Valle del Cauca' };
}
export function sameStreetAddress(input: string, formatted: string) {
 const signature=(value:string)=>{
  const normalized=normalizedAddress(value).replace(/\b(AV)\b/g,'AVENIDA').replace(/\b(TV)\b/g,'TRANSVERSAL').replace(/\b(DG)\b/g,'DIAGONAL');
  const road=/\b(CALLE|CARRERA|AVENIDA|TRANSVERSAL|DIAGONAL)\s+(\d+)/.exec(normalized);
  if (!road) return null;
  const numbers=normalized.slice(road.index+road[0].length).match(/\d+/g)?.slice(0,2);
  return numbers?.length===2 ? [road[1],road[2],...numbers].join(':') : null;
 };
 const original=signature(input);
 return Boolean(original && original===signature(formatted));
}
export type GoogleAddressResult = { inputAddress?: string; countryCode?: string | null; placeId?: string | null; formattedAddress: string;
 context?: { city?:string|null; department?:string|null }; googleContext?: { city?:string|null; department?:string|null };
 location: {lat:number;lng:number} | null; verdict: {geocodeGranularity?:string|null;hasUnconfirmedComponents?:boolean} };
export function googleAddressPoint(result: GoogleAddressResult) {
 const granularity=result.verdict.geocodeGranularity;
 if (result.countryCode !== 'CO' || !result.location || !usableLocation(result.location.lat,result.location.lng)
  || !['SUB_PREMISE','PREMISE','PREMISE_PROXIMITY'].includes(granularity || '')) return null;
 if (result.inputAddress && !sameStreetAddress(result.inputAddress,result.formattedAddress)) return null;
 const expected=normalizedAddress(result.context?.city || 'Cali').replace(/^SANTIAGO DE /,'');
 const returned=normalizedAddress(result.googleContext?.city || '').replace(/^SANTIAGO DE /,'');
 if (!returned || returned!==expected) return null;
 const {lat,lng}=result.location;
 if (expected==='CALI' && (lat<3.25 || lat>3.56 || lng < -76.7 || lng > -76.4)) return null;
 if (expected==='YUMBO' && (lat<3.45 || lat>3.7 || lng < -76.65 || lng > -76.35)) return null;
 return {latitude:lat,longitude:lng,precise:true,precision:granularity!};
}
export function customerMapPlaces(groups: AddressGroup[], rows: {key:string;status:string;latitude:number|null;longitude:number|null}[]) {
 const stored = new Map(rows.map(row=>[row.key,row]));
 return groups.flatMap(group=>{
  const row = stored.get(group.key);
  const point = usableLocation(group.latitude,group.longitude) ? group : row && row.status==='located' ? row : null;
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
