import SerializedAssetComponentLab from '@/components/serialized-assets/SerializedAssetComponentLab';

export default async function AssetMovementSummaryLabPage({
  searchParams,
}: {
  searchParams: Promise<{ empty?: string }>;
}) {
  const { empty } = await searchParams;
  return <SerializedAssetComponentLab component="movement-summary" emptyMovement={empty === '1'} />;
}
