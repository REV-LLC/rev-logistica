import { Paper, Text } from '@mantine/core';

type AssetMovementSummaryProps = {
  warehouseCurrentId: string | null;
  warehouseCurrentName: string;
  worksiteLocationName: string | null;
};

export default function AssetMovementSummary({
  warehouseCurrentId,
  warehouseCurrentName,
  worksiteLocationName,
}: AssetMovementSummaryProps) {
  const worksiteName = worksiteLocationName?.trim();

  if (!worksiteName && !warehouseCurrentId) {
    return null;
  }

  return (
    <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
      <Text className="ui-text-label" mb={4}>
        Movimiento reciente
      </Text>
      <Text className="ui-text-body">
        {worksiteName ? `Ultima ubicacion en obra: ${worksiteName}.` : `Actualmente en ${warehouseCurrentName}.`}
      </Text>
    </Paper>
  );
}
