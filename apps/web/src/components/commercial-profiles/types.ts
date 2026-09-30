import type { ConfigurationEntry } from "../equipment-configuration/types";
import { entryName } from "../equipment-configuration/types";

export type CommercialScope = "ASSET" | "SKU" | "FAMILY" | "ACCESSORY";
export type CommercialUnit = "DAY" | "HOUR" | "METER";
export type CommercialSelector = {
  kind: CommercialScope | "ACCESSORY";
  id: string;
};
export type CommercialGroup = {
  id: string;
  name: string;
  selectors: CommercialSelector[];
};
export type CommercialCondition = {
  groupId: string;
  presence: "PRESENT" | "ABSENT";
  minimumQuantity?: number;
};
export type CommercialMode = {
  id: string;
  name: string;
  unit: CommercialUnit;
  minimum: { value: string; basis: "PER_RENTAL" | "PER_REPORTED_DAY" };
  pricing: { source: "FIXED"; amount: string } | { source: "CATALOG" };
  conditions: CommercialCondition[];
  parts: Array<{ groupId: string; treatment: "INCLUDED" | "INDEPENDENT" }>;
};
export type CommercialProfile = {
  id: string | null;
  scopeType: CommercialScope;
  scopeId: string;
  version: number;
  effectiveFrom: string | null;
  groups: CommercialGroup[];
  modes: CommercialMode[];
  inherited?: Omit<CommercialProfile, "inherited"> | null;
};
export type SelectorOption = { value: string; label: string };
export const unitLabels: Record<CommercialUnit, string> = {
  DAY: "Días",
  HOUR: "Horas",
  METER: "Metros",
};
export const scopeLabels: Record<CommercialScope, string> = {
  ASSET: "Solo este equipo",
  SKU: "Equipos de esta referencia",
  FAMILY: "Toda esta familia",
  ACCESSORY: "Solo este componente o accesorio",
};
export const selectorKey = (selector: CommercialSelector) =>
  `${selector.kind}:${selector.id}`;
export function parseSelectorKey(value: string): CommercialSelector {
  const [kind, id] = value.split(":");
  if (!["ASSET", "SKU", "FAMILY", "ACCESSORY"].includes(kind) || !id)
    throw new Error("Referencia comercial inválida.");
  return { kind: kind as CommercialSelector["kind"], id };
}
export const todayInBogota = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export function configuredSelectorOptions(
  entries: ConfigurationEntry[],
  groups: CommercialGroup[],
): SelectorOption[] {
  const options = new Map<string, string>();
  for (const entry of entries) {
    const selector: CommercialSelector | undefined = entry.assetId
      ? { kind: "ASSET", id: entry.assetId }
      : entry.accessoryId
        ? { kind: "ACCESSORY", id: entry.accessoryId }
        : entry.familyId
          ? { kind: "FAMILY", id: entry.familyId }
          : undefined;
    if (selector)
      options.set(
        selectorKey(selector),
        `${entryName(entry)}${entry.familyId ? " · familia (unidad elegida en la remisión)" : ""}`,
      );
  }
  // Existing references must remain editable even if they are no longer in today's physical configuration.
  for (const group of groups)
    for (const selector of group.selectors) {
      if (!options.has(selectorKey(selector)))
        options.set(
          selectorKey(selector),
          `${group.name} · referencia guardada ${selector.id}`,
        );
    }
  return [...options].map(([value, label]) => ({ value, label }));
}

export function newCommercialMode(id = crypto.randomUUID()): CommercialMode {
  return {
    id,
    name: "",
    unit: "DAY",
    minimum: { value: "0", basis: "PER_RENTAL" },
    pricing: { source: "FIXED", amount: "" },
    conditions: [],
    parts: [],
  };
}
export function commercialPayload(profile: CommercialProfile) {
  return {
    scopeType: profile.scopeType,
    scopeId: profile.scopeId,
    expectedVersion: profile.version,
    effectiveFrom: profile.effectiveFrom,
    groups: profile.groups.map((group) => ({
      id: group.id,
      name: group.name.trim(),
      selectors: group.selectors.map(({ kind, id }) => ({ kind, id })),
    })),
    modes: profile.modes.map((mode) => ({
      id: mode.id,
      name: mode.name.trim(),
      unit: mode.unit,
      minimum: { ...mode.minimum },
      pricing:
        mode.pricing.source === "FIXED"
          ? { source: "FIXED" as const, amount: mode.pricing.amount }
          : { source: "CATALOG" as const },
      conditions: mode.conditions.map((condition) => ({
        groupId: condition.groupId,
        presence: condition.presence,
        ...(condition.presence === "PRESENT"
          ? { minimumQuantity: condition.minimumQuantity ?? 1 }
          : {}),
      })),
      parts: mode.parts.map(({ groupId, treatment }) => ({
        groupId,
        treatment,
      })),
    })),
  };
}
const nonNegativeDecimal = (value: string) =>
  /^\d{1,10}(?:\.\d{1,6})?$/.test(value) && Number.isFinite(Number(value));
export function commercialError(profile: CommercialProfile): string | null {
  if (
    !profile.effectiveFrom ||
    !/^\d{4}-\d{2}-\d{2}$/.test(profile.effectiveFrom)
  )
    return "Indica desde qué fecha aplican estas condiciones.";
  const date = new Date(`${profile.effectiveFrom}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== profile.effectiveFrom
  )
    return "La fecha de vigencia no es válida.";
  if (!profile.modes.length) return "Agrega al menos una modalidad de cobro.";
  const groupIds = new Set(profile.groups.map((group) => group.id));
  if (
    groupIds.size !== profile.groups.length ||
    new Set(profile.modes.map((mode) => mode.id)).size !== profile.modes.length
  )
    return "Hay grupos o modalidades duplicados.";
  for (const group of profile.groups) {
    if (!group.name.trim() || group.name.trim().length > 120)
      return "Escribe el nombre de cada grupo de implementos.";
    if (!group.selectors.length)
      return `Selecciona al menos un elemento para «${group.name}».`;
  }
  for (const mode of profile.modes) {
    if (!mode.name.trim() || mode.name.trim().length > 120)
      return "Escribe el nombre de cada modalidad (máximo 120 caracteres).";
    if (
      !nonNegativeDecimal(mode.minimum.value) ||
      (mode.unit === "DAY" && !Number.isInteger(Number(mode.minimum.value)))
    )
      return `Revisa el mínimo de «${mode.name}». Los días deben ser enteros.`;
    if (
      (mode.unit === "HOUR" && Number(mode.minimum.value) > 24) ||
      (mode.unit === "DAY" && Number(mode.minimum.value) > 999)
    )
      return `Revisa el mínimo de «${mode.name}»: máximo 24 horas por día o 999 días por alquiler.`;
    if (
      mode.minimum.basis !==
      (mode.unit === "HOUR" ? "PER_REPORTED_DAY" : "PER_RENTAL")
    )
      return `La base del mínimo no corresponde a la unidad de «${mode.name}».`;
    if (
      mode.pricing.source === "FIXED" &&
      !/^\d{1,10}(?:\.\d{1,2})?$/.test(mode.pricing.amount)
    )
      return `Escribe una tarifa válida para «${mode.name}». Cero debe indicarse explícitamente.`;
    if (
      mode.conditions.some(
        (condition) =>
          !groupIds.has(condition.groupId) ||
          (condition.presence === "PRESENT" &&
            (!Number.isInteger(condition.minimumQuantity ?? 1) ||
              (condition.minimumQuantity ?? 1) < 1)),
      )
    )
      return `Completa las condiciones de «${mode.name}».`;
    if (
      new Set(mode.conditions.map((condition) => condition.groupId)).size !==
      mode.conditions.length
    )
      return `No repitas un grupo en las condiciones de «${mode.name}».`;
    if (mode.parts.some((part) => !groupIds.has(part.groupId)))
      return `Revisa los elementos de cobro de «${mode.name}».`;
  }
  if (
    profile.modes.length > 1 &&
    profile.modes.some((mode) => !mode.conditions.length)
  )
    return "Con varias modalidades, define cuándo aplica cada una. Una modalidad sin condiciones coincidiría siempre.";
  return null;
}
