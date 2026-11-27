import { createHash } from 'node:crypto';
import { metersBetween } from './tracking-telemetry';
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
// Never accept a street/city centroid or silently choose between distant cities.
export function permanentAddressResult(data: any) {
 const features = Array.isArray(data?.features) ? data.features : [];
 const good = features.filter(f => {
  const p = f?.properties, c = p?.coordinates, code = p?.match_code;
  return f.geometry?.type === 'Point' && p.feature_type === 'address'
   && String(p.context?.country?.country_code).toUpperCase() === 'CO'
   && usableLocation(c?.latitude,c?.longitude)
   && ['rooftop','parcel','point','interpolated'].includes(c.accuracy)
   && ['exact','high'].includes(code?.confidence) && code.street === 'matched' && code.address_number === 'matched'
   && code.place === 'matched';
 });
 if (!good.length) return null;
 const first = good[0].properties;
 if (good.slice(1).some(f => metersBetween(first.coordinates,f.properties.coordinates) > 150)) return null;
 return { latitude:first.coordinates.latitude, longitude:first.coordinates.longitude,
  resolvedAddress:String(first.full_address || [first.name,first.place_formatted].filter(Boolean).join(', ')).slice(0,512) };
}
export function customerMapPlaces(groups: AddressGroup[], rows: {key:string;status:string;latitude:number|null;longitude:number|null}[]) {
 const stored = new Map(rows.map(row=>[row.key,row]));
 return groups.flatMap(group=>{
  const row = stored.get(group.key);
  const point = usableLocation(group.latitude,group.longitude) ? group : row?.status === 'located' ? row : null;
  if (!point || !usableLocation(point.latitude,point.longitude)) return [];
  return [{id:-(parseInt(group.key.slice(0,12),16)+1), name:group.names.join(' · '), address:group.address,
   latitude:point.latitude!,longitude:point.longitude!,radiusMeters:50,siteType:'customer'}];
 });
}
