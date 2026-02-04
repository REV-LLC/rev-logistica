export type BulkItem = {
  skuId: string;
  skuName: string | null;
  imageUrl: string | null;
  imageFileObjectId: string | null;
  quantity: number;
};

export type FormaletaDimensions = {
  widthCm: number;
  lengthCm: number;
};

export type FormaletaGroup = {
  kind: 'formaleta' | 'rinconera' | 'alineador';
  label: string;
  widthCm: number;
  heightCm?: number;
  imageUrl: string | null;
  items: {
    lengthCm: number;
    quantity: number;
    skuEntries: { skuId: string; displayName: string }[];
  }[];
};

const FORMAL_KEYWORDS = ['formaleta', 'form', 'panel', 'panel metalico', 'panel metálico'];
const RINCONERA_KEYWORDS = ['rinconera'];
const ALINEADOR_KEYWORDS = ['alineador'];

export function isFormaletaSkuName(skuName: string | null) {
  if (!skuName) return false;
  const lower = skuName.toLowerCase();
  return FORMAL_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export function isRinconeraSkuName(skuName: string | null) {
  if (!skuName) return false;
  const lower = skuName.toLowerCase();
  return RINCONERA_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export function isAlineadorSkuName(skuName: string | null) {
  if (!skuName) return false;
  const lower = skuName.toLowerCase();
  return ALINEADOR_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export function parseSingleDimension(skuName: string | null) {
  if (!skuName) return null;
  const match = skuName.match(/(\d+(?:[.,]\d+)?)\s*(?:m|cm)?/i);
  if (!match) return null;
  const raw = match[1]?.replace(',', '.');
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return value;
}

export function parseFormaletaDimensions(skuName: string | null) {
  if (!skuName) return null;
  const match = skuName.match(
    /(\d+(?:[.,]\d+)?)\s*(?:m|cm)?\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*(?:m|cm)?(?:\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*(?:m|cm)?)?/i,
  );
  if (!match) return null;
  const rawA = match[1]?.replace(',', '.');
  const rawB = match[2]?.replace(',', '.');
  const rawC = match[3]?.replace(',', '.');
  const dimA = Number(rawA);
  const dimB = Number(rawB);
  const dimC = rawC ? Number(rawC) : null;
  if (!Number.isFinite(dimA) || !Number.isFinite(dimB)) return null;
  if (rawC && !Number.isFinite(dimC)) return null;
  return { dimA, dimB, dimC };
}

export function normalizeFormaletaDimensions(dimA: number, dimB: number): FormaletaDimensions {
  const assumeMeters = dimA <= 10 && dimB <= 10;
  const factor = assumeMeters ? 100 : 1;
  const a = Math.round(dimA * factor);
  const b = Math.round(dimB * factor);
  const widthCm = Math.min(a, b);
  const lengthCm = Math.max(a, b);
  return { widthCm, lengthCm };
}

export function normalizeLengthCm(value: number) {
  const assumeMeters = value <= 10;
  return Math.round(value * (assumeMeters ? 100 : 1));
}

export function buildFormaletaDisplayName(
  skuName: string | null,
  widthCm: number,
  lengthCm: number
) {
  if (!skuName) return `${widthCm}x${lengthCm}`;
  return skuName.replace(
    /(\d+(?:[.,]\d+)?)\s*(?:m|cm)?\s*[xX]\s*(\d+(?:[.,]\d+)?)(?:\s*(?:m|cm))?/i,
    `${widthCm}x${lengthCm}`
  );
}

export function buildRinconeraDisplayName(
  skuName: string | null,
  widthCm: number,
  heightCm: number,
  lengthCm: number
) {
  if (!skuName) return `Rinconera ${widthCm}x${heightCm}x${lengthCm}`;
  return skuName.replace(
    /(\d+(?:[.,]\d+)?)\s*(?:m|cm)?\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*(?:m|cm)?\s*[xX]\s*(\d+(?:[.,]\d+)?)/i,
    `${widthCm}x${heightCm}x${lengthCm}`
  );
}

export function getNormalizedSkuDisplayName(item: BulkItem) {
  const parsed = parseFormaletaDimensions(item.skuName);
  if (!parsed) return item.skuName;
  if (parsed.dimC != null && isRinconeraSkuName(item.skuName)) {
    const base = normalizeFormaletaDimensions(parsed.dimA, parsed.dimB);
    const lengthCm = normalizeLengthCm(parsed.dimC);
    return buildRinconeraDisplayName(item.skuName, base.widthCm, base.lengthCm, lengthCm);
  }
  const normalized = normalizeFormaletaDimensions(parsed.dimA, parsed.dimB);
  return buildFormaletaDisplayName(item.skuName, normalized.widthCm, normalized.lengthCm);
}

export function groupFormaletas(items: BulkItem[]) {
  const formaletas: FormaletaGroup[] = [];
  const otherItems: BulkItem[] = [];

  const groups = new Map<number, FormaletaGroup>();
  const rinconeraGroups = new Map<string, FormaletaGroup>();
  const alineadorGroups = new Map<string, FormaletaGroup>();
  const lengthIndex = new Map<
    string,
    { lengthCm: number; quantity: number; skuEntries: { skuId: string; displayName: string }[] }
  >();

  items.forEach((item) => {
    const isRinconera = isRinconeraSkuName(item.skuName);
    const isFormaleta = isFormaletaSkuName(item.skuName);
    const isAlineador = isAlineadorSkuName(item.skuName);

    if (!isFormaleta && !isRinconera && !isAlineador) {
      otherItems.push(item);
      return;
    }

    if (isAlineador) {
      const parsed = parseSingleDimension(item.skuName);
      if (parsed == null) {
        otherItems.push(item);
        return;
      }
      const lengthCm = normalizeLengthCm(parsed);
      const groupKey = 'alineador';
      if (!alineadorGroups.has(groupKey)) {
        alineadorGroups.set(groupKey, {
          kind: 'alineador',
          label: 'Alineadores',
          widthCm: lengthCm,
          imageUrl: item.imageUrl ?? null,
          items: [],
        });
      }

      const group = alineadorGroups.get(groupKey) as FormaletaGroup;
      if (!group.imageUrl && item.imageUrl) {
        group.imageUrl = item.imageUrl;
      }

      const key = `alineador::${lengthCm}`;
      if (!lengthIndex.has(key)) {
        const entry = {
          lengthCm,
          quantity: 0,
          skuEntries: [],
        };
        lengthIndex.set(key, entry);
        group.items.push(entry);
      }

      const entry = lengthIndex.get(key) as {
        lengthCm: number;
        quantity: number;
        skuEntries: { skuId: string; displayName: string }[];
      };
      entry.quantity += item.quantity;
      entry.skuEntries.push({
        skuId: item.skuId,
        displayName: item.skuName ?? `Alineador ${lengthCm} cm`,
      });
      return;
    }

    const parsed = parseFormaletaDimensions(item.skuName);
    if (!parsed) {
      otherItems.push(item);
      return;
    }

    if (isRinconera) {
      if (parsed.dimC == null) {
        otherItems.push(item);
        return;
      }
      const base = normalizeFormaletaDimensions(parsed.dimA, parsed.dimB);
      const lengthCm = normalizeLengthCm(parsed.dimC);
      const groupKey = `${base.widthCm}x${base.lengthCm}`;
      if (!rinconeraGroups.has(groupKey)) {
        rinconeraGroups.set(groupKey, {
          kind: 'rinconera',
          label: `Rinconera de ${base.widthCm}x${base.lengthCm} cm`,
          widthCm: base.widthCm,
          heightCm: base.lengthCm,
          imageUrl: item.imageUrl ?? null,
          items: [],
        });
      }

      const group = rinconeraGroups.get(groupKey) as FormaletaGroup;
      if (!group.imageUrl && item.imageUrl) {
        group.imageUrl = item.imageUrl;
      }

      const key = `rinconera::${groupKey}::${lengthCm}`;
      if (!lengthIndex.has(key)) {
        const entry = {
          lengthCm,
          quantity: 0,
          skuEntries: [],
        };
        lengthIndex.set(key, entry);
        group.items.push(entry);
      }

      const entry = lengthIndex.get(key) as {
        lengthCm: number;
        quantity: number;
        skuEntries: { skuId: string; displayName: string }[];
      };
      entry.quantity += item.quantity;
      entry.skuEntries.push({
        skuId: item.skuId,
        displayName: buildRinconeraDisplayName(
          item.skuName,
          base.widthCm,
          base.lengthCm,
          lengthCm
        ),
      });
      return;
    }

    const { widthCm, lengthCm } = normalizeFormaletaDimensions(parsed.dimA, parsed.dimB);
    if (!groups.has(widthCm)) {
      groups.set(widthCm, {
        kind: 'formaleta',
        label: `Formaleta ancho ${widthCm} cm`,
        widthCm,
        imageUrl: item.imageUrl ?? null,
        items: [],
      });
    }

    const group = groups.get(widthCm) as FormaletaGroup;
    if (!group.imageUrl && item.imageUrl) {
      group.imageUrl = item.imageUrl;
    }

    const key = `formaleta::${widthCm}::${lengthCm}`;
    if (!lengthIndex.has(key)) {
      const entry = {
        lengthCm,
        quantity: 0,
        skuEntries: [],
      };
      lengthIndex.set(key, entry);
      group.items.push(entry);
    }

    const entry = lengthIndex.get(key) as {
      lengthCm: number;
      quantity: number;
      skuEntries: { skuId: string; displayName: string }[];
    };
    entry.quantity += item.quantity;
    entry.skuEntries.push({
      skuId: item.skuId,
      displayName: buildFormaletaDisplayName(item.skuName, widthCm, lengthCm),
    });
  });

  formaletas.push(...groups.values());
  formaletas.push(...rinconeraGroups.values());
  formaletas.push(...alineadorGroups.values());
  formaletas.forEach((group) => {
    group.items.sort((a, b) => a.lengthCm - b.lengthCm);
  });
  formaletas.sort((a, b) => {
    if (a.kind !== b.kind) {
      const order = ['formaleta', 'rinconera', 'alineador'] as const;
      return order.indexOf(a.kind) - order.indexOf(b.kind);
    }
    return a.widthCm - b.widthCm;
  });

  return { formaletas, otherItems };
}

export function buildFormaletaDebug(items: BulkItem[]) {
  return items.map((item) => {
    const isFormaleta = isFormaletaSkuName(item.skuName);
    const isRinconera = isRinconeraSkuName(item.skuName);
    const parsed = parseFormaletaDimensions(item.skuName);
    const normalized = parsed
      ? normalizeFormaletaDimensions(parsed.dimA, parsed.dimB)
      : null;

    return {
      skuId: item.skuId,
      skuName: item.skuName,
      quantity: item.quantity,
      isFormaleta,
      isRinconera,
      isAlineador: isAlineadorSkuName(item.skuName),
      parsed: parsed
        ? { dimA: parsed.dimA, dimB: parsed.dimB, dimC: parsed.dimC ?? null }
        : null,
      normalized,
      displayName:
        parsed && isRinconera && parsed.dimC != null
          ? buildRinconeraDisplayName(
              item.skuName,
              normalized?.widthCm ?? parsed.dimA,
              normalized?.lengthCm ?? parsed.dimB,
              normalizeLengthCm(parsed.dimC)
            )
          : normalized && isFormaleta
          ? buildFormaletaDisplayName(item.skuName, normalized.widthCm, normalized.lengthCm)
          : item.skuName,
    };
  });
}
