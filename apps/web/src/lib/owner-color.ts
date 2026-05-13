export const OWNER_COLORS = ['blue', 'teal', 'orange', 'pink', 'cyan', 'grape', 'indigo', 'lime'] as const;

export function ownerColorById(ownerId: string | null | undefined) {
  if (!ownerId) return 'gray';

  let hash = 0;
  for (let index = 0; index < ownerId.length; index += 1) {
    hash = (hash * 31 + ownerId.charCodeAt(index)) >>> 0;
  }

  return OWNER_COLORS[hash % OWNER_COLORS.length];
}
