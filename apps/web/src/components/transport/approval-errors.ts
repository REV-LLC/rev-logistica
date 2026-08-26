export type ProviderRemissionRequirement = {
  providerWarehouseId: string;
  providerName: string;
  itemCount: number;
  quantity: number;
  documentUploaded: boolean;
};

export type ApprovalRecovery =
  | { type: 'provider-remission-required'; providers: ProviderRemissionRequirement[] }
  | {
      type: 'mixer-motor-required';
      mixerAssetId: string;
      ownerWarehouseId: string | null;
    };

export function classifyApprovalRecovery(data: unknown): ApprovalRecovery | null {
  if (!data || typeof data !== 'object') return null;
  const response = data as Record<string, unknown>;
  const payload =
    response.message && typeof response.message === 'object'
      ? (response.message as Record<string, unknown>)
      : response;

  if (payload.code === 'PROVIDER_REMISSION_REQUIRED' && Array.isArray(payload.providers)) {
    return {
      type: 'provider-remission-required',
      providers: payload.providers as ProviderRemissionRequirement[],
    };
  }

  const recovery = payload.recovery;
  if (
    payload.code === 'MISSING_MIXER_MOTOR' &&
    recovery &&
    typeof recovery === 'object'
  ) {
    const details = recovery as Record<string, unknown>;
    if (details.type === 'SELECT_MIXER_MOTOR' && typeof details.mixerAssetId === 'string') {
      return {
        type: 'mixer-motor-required',
        mixerAssetId: details.mixerAssetId,
        ownerWarehouseId:
          typeof details.ownerWarehouseId === 'string' ? details.ownerWarehouseId : null,
      };
    }
  }

  return null;
}
