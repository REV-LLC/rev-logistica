import WarehouseInventoryPageClient from '@/components/WarehouseInventoryPageClient';

export default async function ProviderWarehousePage({
  params,
}: {
  params: Promise<{ warehouseId: string }>;
}) {
  const { warehouseId } = await params;

  return (
    <WarehouseInventoryPageClient
      initialWarehouseId={warehouseId}
      detailMode
    />
  );
}
