// Notes are normalized to uppercase on storage; UUID references are case-sensitive
// strings in the catalog, so restore their canonical form without changing opaque IDs.
const normalizeId = (value?: string) => value && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
  ? value.toLowerCase() : value || null;

export function parseDocumentResponsibleIds(notes?: string | null) {
  const values = new Map<string, string>();
  for (const entry of notes?.split('|') ?? []) {
    const [key, ...rest] = entry.split(':');
    if (key && rest.length) values.set(key.trim().toLowerCase(), rest.join(':').trim());
  }
  return {
    driverId: normalizeId(values.get('conductor')),
    receiverId: normalizeId(values.get('recibe')),
    dispatcherId: normalizeId(values.get('despachador')),
  };
}
