import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import {
  modeSchema,
  groupSchema,
} from '../commercial-profiles/commercial-profile.input';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.string().trim().min(1).max(120);
const decimal = z.string().regex(/^\d{1,10}(\.\d{1,6})?$/);
const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
const reason = z.string().trim().min(1).max(500);
const pricing = z
  .object({
    basePrice: money,
    discountPercent: decimal.optional(),
    effectivePrice: money.optional(),
    adjustmentReason: reason.optional(),
  })
  .strict()
  .refine(
    (p) => !(p.discountPercent !== undefined && p.effectivePrice !== undefined),
    'Usa descuento o precio efectivo, no ambos',
  );
const source = z
  .object({
    reference: id,
    origin: z.enum(['PHYSICAL', 'DIGITAL', 'INVENTORY']),
  })
  .strict();
const commercial = z
  .object({
    status: z.enum(['RESOLVED', 'REVIEW']),
    schemaVersion: z.literal(2).optional(),
    contextualZero: z.boolean().optional(),
    parentDocumentItemId: id.optional(),
    frozenProfile: z
      .object({
        id,
        version: z.number().int(),
        effectiveFrom: date,
        groups: z.array(groupSchema).max(100),
        modes: z.array(modeSchema).max(100),
      })
      .strict()
      .optional(),
    catalog: z
      .object({ unit: z.string(), price: money.nullable() })
      .strict()
      .optional(),
    profileId: z.string().optional(),
    version: z.number().int().optional(),
    effectiveFrom: date.optional(),
    mode: modeSchema.optional(),
    basePrice: money.optional(),
    reason: z.string().optional(),
    parts: z
      .array(
        z
          .object({
            documentItemId: id,
            parentAssetId: id.optional(),
            parentDocumentItemId: id.optional(),
            assetId: id.optional(),
            skuId: id.optional(),
            familyId: id.optional(),
            accessoryId: id.optional(),
            label: z.string(),
            quantity: z.number().positive(),
            treatment: z.enum(['INCLUDED', 'INDEPENDENT', 'REVIEW']),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
const includedIn = z
  .object({ assetId: id, label: z.string(), documentItemId: id })
  .strict();
const metering = z
  .object({
    minimumMeters: decimal,
    priorUnits: decimal.optional(),
    pricing,
    reports: z
      .array(z.object({ date, meters: decimal, source }).strict())
      .max(1000),
  })
  .strict();
export const annexInputSchema = z
  .object({
    period: z.object({ from: date, to: date, through: date }).strict(),
    policy: z
      .object({
        version: id,
        includeReturnDay: z.boolean(),
        excludedWeekdays: z.array(z.number().int().min(0).max(6)).max(7),
        excludeHolidays: z.boolean(),
        holidays: z.array(date).max(31),
        holidayCalendarConfirmed: z.boolean(),
        minimumHoursPerMachineDay: decimal,
        minimumHoursByAsset: z.record(id, decimal).optional(),
        minimumDaysByRental: z
          .record(id, z.number().int().min(0).max(999))
          .optional(),
        minimumDaysBySku: z
          .record(id, z.number().int().min(0).max(999))
          .optional(),
        rememberMinimums: z
          .object({
            days: z.record(id, z.number().int().min(0).max(999)),
            hours: z.record(
              id,
              decimal.refine((value) => Number(value) <= 24, 'Máximo 24 horas'),
            ),
          })
          .strict()
          .optional(),
      })
      .strict(),
    rentals: z
      .array(
        z
          .object({
            id,
            skuId: id,
            label: z.string().trim().min(1).max(200),
            assetId: id.optional(),
            accessoryId: id.optional(),
            commercialInterval: z
              .object({ from: date, to: date, rentalId: id })
              .strict()
              .optional(),
            minimumHistoryRanges: z
              .array(z.object({ from: date, to: date, rentalId: id }).strict())
              .max(1000)
              .optional(),
            deliveredOn: date,
            quantity: decimal,
            source,
            returns: z
              .array(z.object({ date, quantity: decimal, source }).strict())
              .max(200),
            pricing,
            commercial: commercial.optional(),
            includedIn: includedIn.optional(),
            metering: metering.optional(),
            allowsCutting: z.boolean().optional(),
            priorBillableDays: decimal.optional(),
            cutting: z
              .object({
                minimumMeters: decimal,
                pricing,
                reports: z
                  .array(z.object({ date, meters: decimal, source }).strict())
                  .max(1000),
              })
              .strict()
              .optional(),
            waivedDays: z.array(z.object({ date, reason }).strict()).max(31),
            dayAdjustments: z
              .array(
                z
                  .object({
                    from: date,
                    to: date,
                    days: z.number().int().min(0).max(999),
                    quantity: decimal,
                  })
                  .strict(),
              )
              .max(31)
              .optional(),
          })
          .strict(),
      )
      .max(500),
    machineDays: z
      .array(
        z
          .object({
            assetId: id,
            rentalId: id.optional(),
            commercial: commercial.optional(),
            includedIn: includedIn.optional(),
            label: z.string().trim().min(1).max(200),
            date,
            status: z.enum(['REPORTED', 'NO_WORK', 'PENDING']),
            confirmationReason: reason.optional(),
            reports: z
              .array(
                z
                  .object({
                    source,
                    employeeId: id,
                    hours: decimal,
                  })
                  .strict(),
              )
              .max(100),
            pricing,
            waiverReason: reason.optional(),
          })
          .strict(),
      )
      .max(3000),
  })
  .strict();
export type AnnexInput = z.infer<typeof annexInputSchema>;
export function parseAnnexInput(value: unknown): AnnexInput {
  const parsed = annexInputSchema.safeParse(value);
  if (!parsed.success)
    throw new BadRequestException(
      parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    );
  return parsed.data;
}
