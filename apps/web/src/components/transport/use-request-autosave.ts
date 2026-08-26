'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

type UseRequestAutosaveInput = {
  draftId: string | null;
  payload: unknown;
  ready: boolean;
  editing: boolean;
  submitting: boolean;
  delayMs?: number;
};

export function useRequestAutosave({
  draftId,
  payload,
  ready,
  editing,
  submitting,
  delayMs = 900,
}: UseRequestAutosaveInput) {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const enabled = Boolean(draftId && ready && !editing && !submitting);

  useEffect(() => {
    if (!enabled || !draftId) return;
    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }

    let active = true;
    const timeout = window.setTimeout(async () => {
      setStatus('saving');
      try {
        await api(`/documents/${draftId}/request/autosave`, {
          method: 'PATCH',
          json: payload,
        });
        if (active) setStatus('saved');
      } catch {
        if (active) setStatus('error');
      }
    }, delayMs);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [delayMs, draftId, enabled, payload]);

  return { status, setStatus };
}
