import { BadRequestException } from '@nestjs/common';

export const COLOMBIAN_PHONE_INPUT_PATTERN =
  /^(?:\+?57)?(?=(?:\D*\d){10}\D*$)[\d\s().-]+$/;

export function normalizeRequiredColombianPhone(value: string) {
  const trimmed = value.trim();
  if (!COLOMBIAN_PHONE_INPUT_PATTERN.test(trimmed)) {
    throw new BadRequestException(
      'El teléfono debe contener exactamente 10 dígitos',
    );
  }
  const digits = trimmed.replace(/\D/g, '');
  const localNumber = digits.length === 12 ? digits.slice(2) : digits;
  return `+57${localNumber}`;
}

export function normalizeStoredColombianPhone(value?: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (/^\d{10}$/.test(digits)) return `+57${digits}`;
  if (/^57\d{10}$/.test(digits)) return `+${digits}`;
  return null;
}
