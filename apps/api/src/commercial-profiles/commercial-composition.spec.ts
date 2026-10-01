import {
  resolveComposition,
  type CommercialNode,
} from './commercial-composition';
import { resolveCommercialMode } from './commercial-resolver';
import { usesCommercialV2 } from './commercial-cutoff';
import type { CommercialMode } from './commercial-profile.input';
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const mode: CommercialMode = {
  id: uuid(1),
  name: 'Equipo arbitrario',
  unit: 'DAY',
  minimum: { value: '0', basis: 'PER_RENTAL' },
  pricing: { source: 'FIXED', amount: '200' },
  conditions: [],
  parts: [{ groupId: uuid(2), treatment: 'INCLUDED' }],
};
const root: CommercialNode = {
  id: 'root',
  assetId: uuid(3),
  label: 'Nombre cualquiera',
  quantity: 1,
  snapshot: {
    status: 'REVIEW',
    schemaVersion: 2,
    parts: [],
    catalog: { unit: 'DAY', price: null },
    frozenProfile: {
      id: uuid(4),
      version: 1,
      effectiveFrom: '2026-10-01',
      groups: [
        {
          id: uuid(2),
          name: 'Implementos',
          selectors: [{ kind: 'ACCESSORY', id: uuid(5) }],
        },
      ],
      modes: [mode],
    },
  },
};
const child: CommercialNode = {
  id: 'child',
  parentId: 'root',
  accessoryId: uuid(5),
  label: 'Accesorio',
  quantity: 2,
  snapshot: { status: 'REVIEW', schemaVersion: 2, parts: [] },
};
describe('commercial composition v2', () => {
  it('uses Bogota document date at the rollout boundary', () => {
    expect(usesCommercialV2(new Date('2026-10-01T04:59:59Z'))).toBe(false);
    expect(usesCommercialV2(new Date('2026-10-01T05:00:00Z'))).toBe(true);
  });
  it('explicit zero is resolved, null is not free', () => {
    const profile = {
      ...root.snapshot.frozenProfile!,
      modes: [{ ...mode, pricing: { source: 'CATALOG' as const }, parts: [] }],
    };
    expect(
      resolveCommercialMode(profile, [], { unit: 'DAY', price: null }).status,
    ).toBe('REVIEW');
    expect(
      resolveCommercialMode(profile, [], { unit: 'DAY', price: '0' }).basePrice,
    ).toBe('0');
  });
  it('keeps a contextual zero row and stops the zero when its parent leaves', () => {
    const result = resolveComposition([root, child]);
    expect(result.get('child')).toMatchObject({
      status: 'RESOLVED',
      basePrice: '0.00',
      contextualZero: true,
    });
    expect(result.get('root')?.parts[0]).toMatchObject({
      parentDocumentItemId: 'root',
      quantity: 2,
    });
    expect(resolveComposition([child]).get('child')?.status).toBe('REVIEW');
  });
  it('handles accessory parents and freezes own paid tariff under contextual zero', () => {
    const parent = {
      ...root,
      id: 'accessory-parent',
      assetId: undefined,
      accessoryId: uuid(8),
    };
    const paidChild = {
      ...child,
      parentId: parent.id,
      snapshot: {
        ...root.snapshot,
        frozenProfile: {
          ...root.snapshot.frozenProfile!,
          groups: [],
          modes: [{ ...mode, parts: [] }],
        },
      },
    };
    const result = resolveComposition([parent, paidChild]);
    expect(result.get('child')?.basePrice).toBe('0.00');
    expect(resolveComposition([paidChild]).get('child')?.basePrice).toBe('200');
    expect(paidChild.snapshot.frozenProfile.modes[0].pricing).toEqual({
      source: 'FIXED',
      amount: '200',
    });
  });
  it('does not resolve cycles as free or sum ambiguous modes', () => {
    const cyclic = { ...root, parentId: 'child' };
    expect(
      [...resolveComposition([cyclic, child]).values()].every(
        (s) => s.status === 'REVIEW',
      ),
    ).toBe(true);
  });
});
