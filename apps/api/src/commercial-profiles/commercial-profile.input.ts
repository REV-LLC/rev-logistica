import { z } from 'zod';
const uuid = z.string().uuid();
const decimal = z.string().regex(/^\d{1,10}(\.\d{1,6})?$/);
export const scopeSchema = z
  .object({ scopeType: z.enum(['ASSET', 'SKU', 'FAMILY']), scopeId: uuid })
  .strict();
export const selectorSchema = z
  .object({ kind: z.enum(['ASSET', 'SKU', 'FAMILY', 'ACCESSORY']), id: uuid })
  .strict();
export const groupSchema = z
  .object({
    id: uuid,
    name: z.string().trim().min(1).max(120),
    selectors: z.array(selectorSchema).min(1).max(100),
  })
  .strict();
export const modeSchema = z
  .object({
    id: uuid,
    name: z.string().trim().min(1).max(120),
    unit: z.enum(['DAY', 'HOUR', 'METER']),
    minimum: z
      .object({
        value: decimal,
        basis: z.enum(['PER_RENTAL', 'PER_REPORTED_DAY']),
      })
      .strict(),
    pricing: z.discriminatedUnion('source', [
      z
        .object({
          source: z.literal('FIXED'),
          amount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),
        })
        .strict(),
      z.object({ source: z.literal('CATALOG') }).strict(),
    ]),
    conditions: z
      .array(
        z
          .object({
            groupId: uuid,
            presence: z.enum(['PRESENT', 'ABSENT']),
            minimumQuantity: z.number().int().min(1).max(1000000).default(1),
          })
          .strict(),
      )
      .max(100),
    parts: z
      .array(
        z
          .object({
            groupId: uuid,
            treatment: z.enum(['INCLUDED', 'INDEPENDENT']),
          })
          .strict(),
      )
      .max(100),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (
      m.minimum.basis !==
      (m.unit === 'HOUR' ? 'PER_REPORTED_DAY' : 'PER_RENTAL')
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Mínimo por día reportado para horas y por alquiler para días/metros',
      });
    if (
      m.unit === 'DAY' &&
      (!Number.isInteger(Number(m.minimum.value)) ||
        Number(m.minimum.value) > 999)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Mínimo de días: entero entre 0 y 999',
      });
    if (m.unit === 'HOUR' && Number(m.minimum.value) > 24)
      ctx.addIssue({ code: 'custom', message: 'Mínimo horario máximo 24' });
  });
export const profileSchema = scopeSchema
  .extend({
    expectedVersion: z.number().int().min(0),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    groups: z.array(groupSchema).max(100),
    modes: z.array(modeSchema).min(1).max(100),
  })
  .strict()
  .superRefine((p, ctx) => {
    const ids = p.groups.map((g) => g.id);
    if (
      new Set(ids).size !== ids.length ||
      new Set(p.modes.map((m) => m.id)).size !== p.modes.length
    )
      ctx.addIssue({ code: 'custom', message: 'Identificadores duplicados' });
    for (const mode of p.modes)
      for (const ref of [...mode.conditions, ...mode.parts])
        if (!ids.includes(ref.groupId))
          ctx.addIssue({
            code: 'custom',
            message: 'La modalidad referencia un grupo inexistente',
          });
    const parsed = new Date(p.effectiveFrom + 'T00:00:00Z');
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== p.effectiveFrom
    )
      ctx.addIssue({ code: 'custom', message: 'Vigencia inválida' });
  });
export type CommercialMode = z.infer<typeof modeSchema>;
export type CommercialGroup = z.infer<typeof groupSchema>;
export type CommercialProfileInput = z.infer<typeof profileSchema>;
export type CommercialScope = z.infer<typeof scopeSchema>;
export type CompositionPart = {
  documentItemId: string;
  parentAssetId: string;
  assetId?: string;
  skuId?: string;
  familyId?: string;
  accessoryId?: string;
  label: string;
  quantity: number;
};
export type CommercialSnapshot = {
  status: 'RESOLVED' | 'REVIEW';
  profileId?: string;
  version?: number;
  effectiveFrom?: string;
  mode?: CommercialMode;
  basePrice?: string;
  reason?: string;
  parts: Array<
    CompositionPart & { treatment: 'INCLUDED' | 'INDEPENDENT' | 'REVIEW' }
  >;
};
