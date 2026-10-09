import { BadRequestException } from '@nestjs/common';
import { EquipmentConfigurationDto, EquipmentConfigurationEntryDto } from './dto/equipment-configuration.dto';

/** Old clients may still submit requirements/caps. In the implement model they
 * are recommendations, never a reason to block a document. Identity and stock
 * checks remain independent and are not relaxed here. */
export function implementRecommendationRules(row: {
  recommendation?: boolean;
  familyId?: string | null;
  required?: boolean;
  maximumQuantity?: number | null;
  defaultIncluded?: boolean;
}) {
  return {
    recommendation: Boolean(row.recommendation || row.familyId || row.required ||
      row.maximumQuantity != null || row.defaultIncluded),
    required: false,
    maximumQuantity: null,
  };
}

/** Recommendations form an explicit family-only forest rooted at the owner.
 * sortOrder only controls presentation; it never implies a relationship. */
export function validateTemplateRoute(entries: EquipmentConfigurationEntryDto[]) {
  const parents = new Map<string, string | null>();
  for (const entry of entries) {
    if (entry.templateParentFamilyId != null && !entry.familyId)
      throw new BadRequestException(
        'La ruta recomendada relaciona familias, no unidades concretas.',
      );
    if (entry.familyId)
      parents.set(entry.familyId, entry.templateParentFamilyId ?? null);
  }
  for (const [familyId, parentFamilyId] of parents) {
    if (parentFamilyId === familyId)
      throw new BadRequestException(
        'Una familia no puede depender de sí misma en la ruta recomendada.',
      );
    if (parentFamilyId && !parents.has(parentFamilyId))
      throw new BadRequestException(
        'La familia anterior debe estar en esta misma ruta recomendada.',
      );
  }
  // Check every node, including a cyclic component disconnected from the root.
  for (const familyId of parents.keys()) {
    const visited = new Set<string>();
    let current: string | null = familyId;
    let depth = 0;
    while (current) {
      if (visited.has(current))
        throw new BadRequestException(
          'La ruta recomendada no puede contener ciclos entre familias.',
        );
      visited.add(current);
      if (++depth > 16)
        throw new BadRequestException(
          'La ruta recomendada admite hasta 16 niveles.',
        );
      current = parents.get(current) ?? null;
    }
  }
}

export function validateConfigurationDraft(dto: EquipmentConfigurationDto) {
  const ids = new Set<string>();
  const targets = new Set<string>();
  if (!Array.isArray(dto.entries) || dto.entries.length > 100)
    throw new BadRequestException(
      'La configuración permite hasta 100 elementos.',
    );
  for (const entry of dto.entries) {
    if (ids.has(entry.id))
      throw new BadRequestException(
        'Hay filas duplicadas en la configuración.',
      );
    ids.add(entry.id);
    if (
      [entry.assetId, entry.skuId, entry.accessoryId, entry.familyId, entry.newPart].filter(Boolean)
        .length !== 1
    )
      throw new BadRequestException(
        'Cada fila debe vincular un elemento existente o crear uno nuevo, no ambos.',
      );
    if (
      !Number.isSafeInteger(entry.quantity) ||
      entry.quantity < 1 ||
      entry.quantity > 1000000
    )
      throw new BadRequestException('Indica una cantidad entera positiva.');
    if (entry.maximumQuantity != null && (!Number.isSafeInteger(entry.maximumQuantity) || entry.maximumQuantity < entry.quantity))
      throw new BadRequestException('El máximo no puede ser menor a la cantidad propuesta.');
    if (entry.familyId && entry.defaultIncluded)
      throw new BadRequestException('Elige una unidad concreta para incluirla por defecto; una familia no identifica una unidad.');
    const key = entry.assetId
      ? `asset:${entry.assetId}`
      : entry.accessoryId
        ? `accessory:${entry.accessoryId}`
        : entry.skuId ? `sku:${entry.skuId}` : entry.familyId ? `family:${entry.familyId}` : null;
    if (key && targets.has(key))
      throw new BadRequestException(
        'Un elemento no puede repetirse en la configuración.',
      );
    if (key) targets.add(key);
    if (entry.assetId && entry.quantity !== 1)
      throw new BadRequestException(
        'Un equipo identificado representa una sola unidad.',
      );
    if (entry.newPart) {
      const part = entry.newPart;
      if (!part.name.trim())
        throw new BadRequestException(
          'Escribe el nombre del componente o accesorio.',
        );
      if (
        !Number.isSafeInteger(part.initialQuantity) ||
        part.initialQuantity < 1 ||
        part.initialQuantity > 1000000
      )
        throw new BadRequestException(
          'La existencia inicial debe ser un entero positivo.',
        );
      if (
        part.kind === 'INDIVIDUAL' &&
        (part.initialQuantity !== 1 || entry.quantity !== 1)
      )
        throw new BadRequestException(
          'Cada elemento individualizado se registra de a una unidad.',
        );
      if (entry.role === 'COMPONENT' && part.kind !== 'INDIVIDUAL')
        throw new BadRequestException(
          'Los componentes de configuración tienen identidad individual.',
        );
      if (part.exclusive && entry.role !== 'COMPONENT')
        throw new BadRequestException(
          'La pertenencia exclusiva se reserva para componentes del equipo.',
        );
    }
  }
  validateTemplateRoute(dto.entries);
}

export function assertAcyclicConfiguration(
  root: string,
  edges: Array<[string, string]>,
) {
  const adjacency = new Map<string, string[]>();
  for (const [parent, child] of edges)
    adjacency.set(parent, [...(adjacency.get(parent) ?? []), child]);
  const visiting = new Set<string>();
  const heights = new Map<string, number>();
  const visit = (node: string, depth: number) => {
    if (visiting.has(node))
      throw new BadRequestException(
        'Un conjunto no puede contenerse a sí mismo, directa o indirectamente.',
      );
    if (depth > 16)
      throw new BadRequestException(
        'La configuración admite hasta 16 niveles.',
      );
    const known = heights.get(node);
    if (known !== undefined) {
      if (depth + known > 16)
        throw new BadRequestException(
          'La configuración admite hasta 16 niveles.',
        );
      return known;
    }
    visiting.add(node);
    let height = 0;
    for (const child of adjacency.get(node) ?? [])
      height = Math.max(height, visit(child, depth + 1) + 1);
    visiting.delete(node);
    heights.set(node, height);
    return height;
  };
  visit(root, 0);
}
