export type ScaffoldPieceKey =
  | 'horizontal-0.7'
  | 'horizontal-1.4'
  | 'horizontal-2'
  | 'horizontal-3'
  | 'vertical-spigot-1'
  | 'vertical-spigot-2'
  | 'vertical-plain-1'
  | 'vertical-plain-2'
  | 'diagonal-0.7'
  | 'diagonal-1.4'
  | 'diagonal-2'
  | 'diagonal-3'
  | 'base-collar'
  | 'leveling-jack'
  | 'wheel'
  | 'platform-1.4'
  | 'platform-3'
  | 'ladder-cat'
  | 'ladder-stair';

export type RequiredPiece = {
  key: ScaffoldPieceKey;
  label: string;
  quantity: number;
  severity?: 'ideal' | 'warning' | 'missing';
  note?: string;
};

export type ModulationOption = {
  segments: number[];
  total: number;
  delta: number;
  fit: 'exact' | 'under' | 'over';
  score: number;
};

export type ScaffoldCalculationInput = {
  targetLength: number;
  width: number;
  height: number;
  spaceLimited: boolean;
  platformLevels?: number;
  includeBaseCollar?: boolean;
  supportMode?: 'leveling-jack' | 'wheel';
  maxOptions?: number;
  selectedSegments?: number[];
  selectedWidthSegments?: number[];
};

export type ScaffoldCalculation = {
  recommended: ModulationOption;
  recommendedWidth: ModulationOption;
  options: ModulationOption[];
  widthOptions: ModulationOption[];
  pieces: RequiredPiece[];
  metrics: {
    bays: number;
    widthBays: number;
    verticalLines: number;
    widthLines: number;
    verticalPoints: number;
    supportPoints: number;
    heightBodies: number;
    horizontalLevels: number;
    platformLevels: number;
    totalLength: number;
    footprintArea: number;
  };
  warnings: string[];
};

export const scaffoldPieces: Record<ScaffoldPieceKey, { label: string; aliases: string[] }> = {
  'horizontal-0.7': {
    label: 'Horizontal 0.70 M',
    aliases: ['horizontal 0.7', 'horizontal 0.70', 'horiz 0.7', '0.70 horizontal'],
  },
  'horizontal-1.4': {
    label: 'Horizontal 1.40 M',
    aliases: ['horizontal 1.4', 'horizontal 1.40', 'horiz 1.4', '1.40 horizontal'],
  },
  'horizontal-2': {
    label: 'Horizontal 2.00 M (proveedor)',
    aliases: ['horizontal 2', 'horizontal 2.0', 'horizontal 2.00', '2.00 horizontal'],
  },
  'horizontal-3': {
    label: 'Horizontal 3.00 M',
    aliases: ['horizontal 3', 'horizontal 3.0', 'horizontal 3.00', '3.00 horizontal'],
  },
  'vertical-spigot-1': {
    label: 'Vertical con espigo 1.00 M',
    aliases: ['vertical con espigo 1', 'vertical espigo 1', 'vertical c/espigo 1'],
  },
  'vertical-spigot-2': {
    label: 'Vertical con espigo 2.00 M',
    aliases: ['vertical con espigo 2', 'vertical espigo 2', 'vertical c/espigo 2'],
  },
  'vertical-plain-1': {
    label: 'Vertical sin espigo 1.00 M',
    aliases: ['vertical sin espigo 1', 'vertical 1 sin espigo', 'vertical s/espigo 1'],
  },
  'vertical-plain-2': {
    label: 'Vertical sin espigo 2.00 M',
    aliases: ['vertical sin espigo 2', 'vertical 2 sin espigo', 'vertical s/espigo 2'],
  },
  'diagonal-0.7': {
    label: 'Diagonal para 0.70 M',
    aliases: ['diagonal 0.7', 'diagonal 0.70'],
  },
  'diagonal-1.4': {
    label: 'Diagonal para 1.40 M',
    aliases: ['diagonal 1.4', 'diagonal 1.40'],
  },
  'diagonal-2': {
    label: 'Diagonal para 2.00 M',
    aliases: ['diagonal 2', 'diagonal 2.0', 'diagonal 2.00'],
  },
  'diagonal-3': {
    label: 'Diagonal para 3.00 M',
    aliases: ['diagonal 3', 'diagonal 3.0', 'diagonal 3.00'],
  },
  'base-collar': {
    label: 'Base collar',
    aliases: ['base collar', 'collar'],
  },
  'leveling-jack': {
    label: 'Tornillo nivelador',
    aliases: ['tornillo nivelador', 'nivelador', 'husillo'],
  },
  wheel: {
    label: 'Rueda',
    aliases: ['rueda', 'ruedas'],
  },
  'platform-1.4': {
    label: 'Plataforma 1.40 M',
    aliases: ['plataforma 1.4', 'plataforma 1.40'],
  },
  'platform-3': {
    label: 'Plataforma 3.00 M',
    aliases: ['plataforma 3', 'plataforma 3.0', 'plataforma 3.00'],
  },
  'ladder-cat': {
    label: 'Escalera tipo gato',
    aliases: ['escalera gato', 'tipo gato'],
  },
  'ladder-stair': {
    label: 'Escalera tipo peldaño',
    aliases: ['escalera peldaño', 'escalera peldano', 'tipo peldaño', 'tipo peldano'],
  },
};

const ownedSegmentLengths = [3, 1.4, 0.7];
const providerSegmentLengths = [2];
const lengthToHorizontalKey: Record<number, ScaffoldPieceKey> = {
  0.7: 'horizontal-0.7',
  1.4: 'horizontal-1.4',
  2: 'horizontal-2',
  3: 'horizontal-3',
};
const lengthToDiagonalKey: Record<number, ScaffoldPieceKey> = {
  0.7: 'diagonal-0.7',
  1.4: 'diagonal-1.4',
  2: 'diagonal-2',
  3: 'diagonal-3',
};

function roundTenths(value: number) {
  return Math.round(value * 10) / 10;
}

function optionFromSegments(segments: number[], targetLength: number): ModulationOption {
  const total = roundTenths(segments.reduce((sum, segment) => sum + segment, 0));
  const delta = roundTenths(total - targetLength);
  return {
    segments,
    total,
    delta,
    fit: delta === 0 ? 'exact' : delta < 0 ? 'under' : 'over',
    score: Math.abs(delta) * 10 + segments.length * 0.2 + segments.filter((segment) => segment === 2).length * 4,
  };
}

function addPiece(
  map: Map<ScaffoldPieceKey, RequiredPiece>,
  key: ScaffoldPieceKey,
  quantity: number,
  options?: Pick<RequiredPiece, 'severity' | 'note'>,
) {
  if (quantity <= 0) return;
  const current = map.get(key);
  if (current) {
    current.quantity += quantity;
    if (options?.severity === 'warning') current.severity = 'warning';
    if (options?.note) current.note = options.note;
    return;
  }
  map.set(key, {
    key,
    label: scaffoldPieces[key].label,
    quantity,
    severity: options?.severity ?? 'ideal',
    note: options?.note,
  });
}

export function generateModulationOptions({
  targetLength,
  spaceLimited,
  maxOptions = 8,
}: {
  targetLength: number;
  spaceLimited: boolean;
  maxOptions?: number;
}) {
  const maxLength = Math.max(targetLength + 3, targetLength * 1.35);
  const maxSegments = Math.max(1, Math.ceil(maxLength / 0.7));
  const found = new Map<string, ModulationOption>();
  const segmentLengths = [...ownedSegmentLengths, ...providerSegmentLengths];

  function walk(startIndex: number, remainingSegments: number, segments: number[], total: number) {
    if (segments.length > 0) {
      const roundedTotal = roundTenths(total);
      const delta = roundTenths(roundedTotal - targetLength);
      const validBySpace = spaceLimited ? delta <= 0 : delta >= 0;
      const nearEnough = Math.abs(delta) <= 3 || delta === 0;

      if (validBySpace && nearEnough) {
        const key = segments.join('+');
        const exactBonus = delta === 0 ? -100 : 0;
        const providerPenalty = segments.filter((segment) => segment === 2).length * 4;
        const score = exactBonus + Math.abs(delta) * 10 + segments.length * 0.2 + providerPenalty;
        found.set(key, {
          segments: [...segments],
          total: roundedTotal,
          delta,
          fit: delta === 0 ? 'exact' : delta < 0 ? 'under' : 'over',
          score,
        });
      }
    }

    if (remainingSegments === 0 || total > maxLength) return;

    for (let index = startIndex; index < segmentLengths.length; index += 1) {
      const length = segmentLengths[index];
      segments.push(length);
      walk(index, remainingSegments - 1, segments, roundTenths(total + length));
      segments.pop();
    }
  }

  walk(0, maxSegments, [], 0);

  return [...found.values()]
    .sort((a, b) => a.score - b.score || b.total - a.total)
    .slice(0, maxOptions);
}

export function calculateScaffold(input: ScaffoldCalculationInput): ScaffoldCalculation {
  const options = generateModulationOptions({
    targetLength: input.targetLength,
    spaceLimited: input.spaceLimited,
    maxOptions: input.maxOptions,
  });
  const selectedKey = input.selectedSegments?.join('+');
  const selectedOption = selectedKey
    ? options.find((option) => option.segments.join('+') === selectedKey)
    : undefined;
  const recommended =
    selectedOption ??
    options[0] ??
    optionFromSegments(input.selectedSegments?.length ? input.selectedSegments : [3], input.targetLength);
  const widthOptions = generateModulationOptions({
    targetLength: input.width,
    spaceLimited: input.spaceLimited,
    maxOptions: input.maxOptions,
  });
  const selectedWidthKey = input.selectedWidthSegments?.join('+');
  const selectedWidthOption = selectedWidthKey
    ? widthOptions.find((option) => option.segments.join('+') === selectedWidthKey)
    : undefined;
  const recommendedWidth =
    selectedWidthOption ??
    widthOptions[0] ??
    optionFromSegments(input.selectedWidthSegments?.length ? input.selectedWidthSegments : [input.width], input.width);
  const pieces = new Map<ScaffoldPieceKey, RequiredPiece>();
  const twoMeterBodies = Math.floor(input.height / 2);
  const hasOneMeterTop = input.height % 2 > 0;
  const heightBodies = Math.max(1, twoMeterBodies + (hasOneMeterTop ? 1 : 0));
  const normalizedHeight = twoMeterBodies * 2 + (hasOneMeterTop ? 1 : 0);
  const horizontalLevels = twoMeterBodies * 3 + (hasOneMeterTop ? 2 : 0);
  const verticalLines = recommended.segments.length + 1;
  const widthLines = recommendedWidth.segments.length + 1;
  const verticalPoints = verticalLines * widthLines;
  const supportPoints = verticalPoints;
  const platformLevels = input.platformLevels ?? Math.max(1, twoMeterBodies);
  const warnings = new Set<string>();

  addPiece(pieces, 'vertical-spigot-2', verticalPoints * twoMeterBodies);
  if (hasOneMeterTop) {
    addPiece(pieces, 'vertical-spigot-1', verticalPoints);
  }

  recommended.segments.forEach((segment) => {
    const horizontalKey = lengthToHorizontalKey[segment];
    const diagonalKey = lengthToDiagonalKey[segment];
    addPiece(pieces, horizontalKey, widthLines * horizontalLevels, segment === 2 ? {
      severity: 'warning',
      note: 'No es pieza propia; conseguir con proveedor si se elige esta modulación.',
    } : undefined);
    addPiece(pieces, diagonalKey, 2 * recommendedWidth.segments.length * twoMeterBodies);
  });

  recommendedWidth.segments.forEach((segment) => {
    const horizontalKey = lengthToHorizontalKey[segment];
    const diagonalKey = lengthToDiagonalKey[segment];
    addPiece(pieces, horizontalKey, verticalLines * horizontalLevels, segment === 2 ? {
      severity: 'warning',
      note: 'No es pieza propia; conseguir con proveedor si se elige esta modulación.',
    } : undefined);
    addPiece(pieces, diagonalKey, 2 * recommended.segments.length * twoMeterBodies);
  });

  if (recommended.segments.includes(2) || recommendedWidth.segments.includes(2)) {
    warnings.add('La modulación usa horizontales de 2.00 M; no son propios y deben conseguirse con proveedor.');
  }

  if (input.includeBaseCollar !== false) {
    addPiece(pieces, 'base-collar', supportPoints);
  }
  addPiece(pieces, input.supportMode === 'wheel' ? 'wheel' : 'leveling-jack', supportPoints);

  if (recommendedWidth.segments.includes(2)) {
    warnings.add('No hay plataforma compatible para modulo de 2.00 M segun la regla actual.');
  } else {
    recommended.segments.forEach((segment) => {
      if (segment === 1.4) {
        addPiece(pieces, 'platform-1.4', platformLevels * recommendedWidth.segments.length * 2);
      } else if (segment === 3) {
        addPiece(pieces, 'platform-3', platformLevels * recommendedWidth.segments.length * 2);
      } else if (segment === 2) {
        warnings.add('Los tramos de 2.00 M no tienen plataforma compatible configurada.');
      } else if (segment === 0.7) {
        warnings.add('Los tramos de 0.70 M no tienen plataforma compatible configurada.');
      }
    });
  }

  addPiece(pieces, 'ladder-cat', twoMeterBodies);

  if (normalizedHeight !== input.height) {
    warnings.add(`La altura se ajusta a ${normalizedHeight.toFixed(2)} M porque se arma con cuerpos de 2.00 M y remate de 1.00 M.`);
  }

  return {
    recommended,
    recommendedWidth,
    options,
    widthOptions,
    pieces: [...pieces.values()],
    metrics: {
      bays: recommended.segments.length,
      widthBays: recommendedWidth.segments.length,
      verticalLines,
      widthLines,
      verticalPoints,
      supportPoints,
      heightBodies,
      horizontalLevels,
      platformLevels,
      totalLength: recommended.total,
      footprintArea: roundTenths(recommended.total * recommendedWidth.total),
    },
    warnings: [...warnings],
  };
}
