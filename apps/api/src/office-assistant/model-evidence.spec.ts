import { compactEvidence } from './model-evidence';

describe('compact evidence', () => {
  const source = { id: '1', title: 'Inventario', columns: ['nombre_de_articulo', 'nombre_de_ubicacion', 'cantidad'],
    rows: Array.from({ length: 100 }, () => ({ nombre_de_articulo: 'Artículo de prueba', nombre_de_ubicacion: 'Bodega de prueba', cantidad: '12' })),
    views: ['inventory_balances'], rowCount: 100, truncated: false, queriedAt: '2026-09-15' };
  it('reduces payload size while preserving every value and column order', () => {
    const { data } = compactEvidence(source, 32000);
    expect(data.rows).toHaveLength(100);
    expect(data.rows[0]).toEqual(['Artículo de prueba', 'Bodega de prueba', '12']);
    expect(data.truncated).toBe(false);
    expect(JSON.stringify(data).length).toBeLessThan(JSON.stringify(source).length * 0.65);
    expect(source.rows[0].cantidad).toBe('12');
  });
  it('marks model-only truncation without changing UI/export evidence', () => {
    const { data } = compactEvidence(source, 400);
    expect(data.truncated).toBe(true);
    expect(data.rows.length).toBeLessThan(100);
    expect(data.rowCount).toBe(data.rows.length);
    expect(source.rows).toHaveLength(100);
    expect(source.truncated).toBe(false);
  });
  it('preserves zero, false, null and absent values', () => {
    const { data } = compactEvidence({ ...source, columns: ['a', 'b', 'c', 'd'], rows: [{ a: 0, b: false, c: null }], rowCount: 1 }, 32000);
    expect(data.rows).toEqual([[0, false, null, null]]);
  });
});
