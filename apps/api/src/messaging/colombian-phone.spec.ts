import { BadRequestException } from '@nestjs/common';
import {
  normalizeRequiredColombianPhone,
  normalizeStoredColombianPhone,
} from './colombian-phone';

describe('Colombian phone normalization', () => {
  it('normalizes a local 10-digit input', () => {
    expect(normalizeRequiredColombianPhone('3001234567')).toBe('+573001234567');
  });

  it.each([
    '+573001234567',
    '+57 300 123 4567',
    '57 300-123-4567',
    '(300) 123 4567',
  ])('normalizes a valid formatted input: %s', (value) => {
    expect(normalizeRequiredColombianPhone(value)).toBe('+573001234567');
  });

  it.each([
    '300123456',
    '30012345678',
    'abcdefghij',
    'abc 3001234567',
    '+58 3001234567',
  ])('rejects unsafe form input: %s', (value) => {
    expect(() => normalizeRequiredColombianPhone(value)).toThrow(
      BadRequestException,
    );
  });

  it('normalizes existing customer phones and rejects invalid ones', () => {
    expect(normalizeStoredColombianPhone('300 123 4567')).toBe('+573001234567');
    expect(normalizeStoredColombianPhone('+57 300 123 4567')).toBe(
      '+573001234567',
    );
    expect(normalizeStoredColombianPhone('123')).toBeNull();
  });
});
