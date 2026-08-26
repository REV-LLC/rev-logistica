'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import {
  classifyApprovalRecovery,
  type ProviderRemissionRequirement,
} from '@/components/transport/approval-errors';

type UseRequestApprovalInput = {
  onReload: () => Promise<void>;
  onError: (error: unknown, documentId?: string) => void;
  onProviderRemissionRequired: (
    documentId: string,
    requirements: {
      required: boolean;
      providers: ProviderRemissionRequirement[];
      missingProviders: ProviderRemissionRequirement[];
    },
  ) => void;
};

export function useRequestApproval({
  onReload,
  onError,
  onProviderRemissionRequired,
}: UseRequestApprovalInput) {
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const callbacksRef = useRef({ onReload, onError, onProviderRemissionRequired });
  callbacksRef.current = { onReload, onError, onProviderRemissionRequired };

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const approve = useCallback(async (documentId: string) => {
    setDecidingId(documentId);
    try {
      const requirements = await api<{
        required: boolean;
        providers: ProviderRemissionRequirement[];
        missingProviders: ProviderRemissionRequirement[];
      }>(`/documents/${documentId}/provider-remission-requirements`, { method: 'GET' });
      if (requirements.missingProviders.length) {
        callbacksRef.current.onProviderRemissionRequired(
          documentId,
          requirements,
        );
        return false;
      }
      await api(`/documents/${documentId}/decision`, {
        method: 'POST',
        json: { action: 'APPROVE' },
      });
      await callbacksRef.current.onReload();
      return true;
    } catch (error) {
      const recovery = error instanceof ApiError
        ? classifyApprovalRecovery(error.data)
        : null;
      if (recovery?.type === 'provider-remission-required' && recovery.providers.length) {
        callbacksRef.current.onProviderRemissionRequired(documentId, {
          required: true,
          providers: recovery.providers,
          missingProviders: recovery.providers,
        });
        return false;
      }
      callbacksRef.current.onError(error, documentId);
      return false;
    } finally {
      if (mountedRef.current) setDecidingId(null);
    }
  }, []);

  const reject = useCallback(async (documentId: string, reason?: string) => {
    setDecidingId(documentId);
    try {
      await api(`/documents/${documentId}/decision`, {
        method: 'POST',
        json: { action: 'REJECT', reason },
      });
      await callbacksRef.current.onReload();
      return true;
    } catch (error) {
      callbacksRef.current.onError(error);
      return false;
    } finally {
      if (mountedRef.current) setDecidingId(null);
    }
  }, []);

  return { decidingId, approve, reject };
}
