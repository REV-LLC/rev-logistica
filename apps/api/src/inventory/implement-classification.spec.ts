import { validateImplementClassification as validate } from './implement-classification';

describe('implement classification', () => {
  it('allows ordinary serialized equipment and ordinary bulk stock', () => {
    expect(() => validate('SERIAL', false, false)).not.toThrow();
    expect(() => validate('BULK', false, false)).not.toThrow();
  });
  it('allows individual implements, returnable quantities and consumables by quantity', () => {
    expect(() => validate('SERIAL', true, false)).not.toThrow();
    expect(() => validate('BULK', true, false)).not.toThrow();
    expect(() => validate('BULK', true, true)).not.toThrow();
  });
  it('rejects consumables as serialized assets or outside the implement classification', () => {
    expect(() => validate('SERIAL', true, true)).toThrow('bulk');
    expect(() => validate('BULK', false, true)).toThrow('clasificado');
  });
});
