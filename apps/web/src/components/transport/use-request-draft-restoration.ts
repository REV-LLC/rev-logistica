'use client';

import { useEffect, useRef } from 'react';
import {
  getRequestDraftStorageKey,
  resolveRequestDraftTarget,
} from '@/components/transport/request-draft';

type UseRequestDraftRestorationInput = {
  enabled: boolean;
  currentUserId: string | null;
  editingRequestId: string | null;
  autosaveDraftId: string | null;
  onRestore: (documentId: string, autosaved: boolean) => Promise<void>;
};

export function useRequestDraftRestoration({
  enabled,
  currentUserId,
  editingRequestId,
  autosaveDraftId,
  onRestore,
}: UseRequestDraftRestorationInput) {
  const restoringTargetRef = useRef<string | null>(null);
  const restoreRef = useRef(onRestore);
  restoreRef.current = onRestore;

  useEffect(() => {
    if (!enabled) return;
    const storedDraftId = currentUserId
      ? window.localStorage.getItem(getRequestDraftStorageKey(currentUserId))
      : null;
    const restoration = resolveRequestDraftTarget(window.location.search, storedDraftId);
    if (!restoration || restoringTargetRef.current === restoration.target) return;
    if (!restoration.autosaved && editingRequestId === restoration.documentId) return;
    if (restoration.autosaved && autosaveDraftId === restoration.documentId) return;

    restoringTargetRef.current = restoration.target;
    void restoreRef.current(restoration.documentId, restoration.autosaved).finally(() => {
      if (restoringTargetRef.current === restoration.target) {
        restoringTargetRef.current = null;
      }
    });
  }, [autosaveDraftId, currentUserId, editingRequestId, enabled]);
}
