import { normalizeAssetFamilyIdentity } from './asset-family-normalization';

describe('normalizeAssetFamilyIdentity', () => {
  it.each([
    ['MINICARGADOR', 'MINI CARGADOR'],
    ['MINI-CARGADOR', 'mini_cargador'],
    ['RETROEXCAVADORA', 'RETRO EXCAVADORA'],
    ['RETRO-EXCAVADORA', 'retro_excavadora'],
    ['MAQUINARIA', 'máquinaria'],
  ])('treats %s and %s as the same family', (left, right) => {
    expect(normalizeAssetFamilyIdentity(left)).toBe(
      normalizeAssetFamilyIdentity(right),
    );
  });
});
