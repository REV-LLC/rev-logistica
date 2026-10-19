type NavigationLink = {
  href: string;
  label: string;
  children?: NavigationLink[];
};

export type NavigationSearchEntry = {
  href: string;
  label: string;
  group: string;
  keywords: string;
};

const aliases: Record<string, string> = {
  '/transport/tracking': 'mapa ubicacion seguimiento camiones gps',
  '/transport/vehicles': 'vehiculos carros camiones flota',
  '/transport/generate': 'crear generar documento remision devolucion entrega',
  '/transport/requests': 'documentos solicitudes remisiones devoluciones',
  '/employees': 'empleados personal trabajadores directorio',
  '/employees/payroll': 'nomina pagos salarios',
  '/inventory/warehouse?scope=own': 'inventario propio existencias stock',
  '/inventory/bulk-adjustments': 'agregar crear equipo material inventario ajustes',
  '/tools/quotation': 'cotizacion cotizar presupuesto',
};

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
}

// The caller supplies already-authorized links, so search shares the sidebar's permissions.
export function buildNavigationSearchEntries(groups: { title: string; links: NavigationLink[] }[]) {
  const entries = new Map<string, NavigationSearchEntry>();
  function visit(link: NavigationLink, group: string, parents: string[]) {
    const keywords = normalize([group, ...parents, link.label, aliases[link.href] ?? ''].join(' '));
    const existing = entries.get(link.href);
    if (existing) existing.keywords += ` ${keywords}`;
    else entries.set(link.href, { href: link.href, label: link.label, group, keywords });
    link.children?.forEach(child => visit(child, group, [...parents, link.label]));
  }
  groups.forEach(group => group.links.forEach(link => visit(link, group.title, [])));
  return [...entries.values()];
}

export function searchNavigation(entries: NavigationSearchEntry[], query: string) {
  const normalized = normalize(query);
  if (!normalized) return entries.slice(0, 8);
  const terms = normalized.split(/\s+/);
  return entries
    .filter(entry => terms.every(term => entry.keywords.includes(term)))
    .map(entry => ({ entry, rank: normalize(entry.label) === normalized ? 0 : normalize(entry.label).startsWith(normalized) ? 1 : 2 }))
    .sort((a, b) => a.rank - b.rank)
    .map(result => result.entry);
}
