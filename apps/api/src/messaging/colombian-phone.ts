import { BadRequestException } from '@nestjs/common';

export function normalizeRequiredColombianPhone(value: string) {
  if (!/^\d{10}$/.test(value)) {
    throw new BadRequestException('El teléfono debe contener exactamente 10 dígitos');
  }
  return `+57${value}`;
}

export function normalizeStoredColombianPhone(value?: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (/^\d{10}$/.test(digits)) return `+57${digits}`;
  if (/^57\d{10}$/.test(digits)) return `+${digits}`;
  return null;
}
