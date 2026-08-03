const quantityMultiplierByArticle: Readonly<Record<string, number>> = {
  // El sistema anterior registraba un cuerpo completo como una unidad,
  // mientras que el catálogo actual controla sus dos laterales como naves.
  '40': 2,
  '42': 2,
};

export function legacyInventoryQuantityMultiplier(
  articleCode: string,
  explicitMultiplier?: unknown,
) {
  const parsedExplicitMultiplier = Number(explicitMultiplier);
  if (
    Number.isFinite(parsedExplicitMultiplier) &&
    parsedExplicitMultiplier > 0
  ) {
    return parsedExplicitMultiplier;
  }
  return quantityMultiplierByArticle[articleCode] ?? 1;
}
