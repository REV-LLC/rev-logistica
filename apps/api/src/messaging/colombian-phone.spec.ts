import { BadRequestException } from '@nestjs/common';
import {
  normalizeRequiredColombianPhone,
  normalizeStoredColombianPhone,
} from './colombian-phone';

describe('Colombian phone normalization', () => {
  it('adds +57 only to an exact 10-digit input', () => {
    expect(normalizeRequiredColombianPhone('3001234567')).toBe('+573001234567');
  });

  it.each([
    '300123456',
    '30012345678',
    '+573001234567',
    '300 123 4567',
    'abcdefghij',
  ])('rejects unsafe form input: %s', (value) => {
    expect(() => normalizeRequiredColombianPhone(value)).toThrow(BadRequestException);
  });

  it('normalizes existing customer phones and rejects invalid ones', () => {
    expect(normalizeStoredColombianPhone('300 123 4567')).toBe('+573001234567');
    expect(normalizeStoredColombianPhone('+57 300 123 4567')).toBe('+573001234567');
    expect(normalizeStoredColombianPhone('123')).toBeNull();
  });
});
