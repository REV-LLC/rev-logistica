import type { AttendanceSite } from './attendance';

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
}

export function searchAttendanceSites(sites: AttendanceSite[], query: string) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return sites.filter(site => {
    const text = normalize([site.alias, site.worksite.name, site.customer.name].filter(Boolean).join(' '));
    return words.every(word => text.includes(word));
  }).sort((a, b) => Number(preferredSite(b)) - Number(preferredSite(a)));
}

function preferredSite(site: AttendanceSite) {
  const name = normalize([site.alias, site.worksite.name, site.customer.name].filter(Boolean).join(' '));
  return ['bodega', 'renta', 'equipos', 'valle'].every(word => name.includes(word));
}
