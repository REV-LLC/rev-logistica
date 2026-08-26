'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { ProviderRemissionRequirement } from '@/components/transport/approval-errors';
import {
  type ImageFileDraft,
  validateImageFile,
} from '@/components/transport/file-drafts';

export const useProviderRemissions = () => {
  const [drafts, setDrafts] = useState<Record<string, ImageFileDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const draftsRef = useRef<Record<string, ImageFileDraft>>({});

  const replaceDrafts = useCallback((next: Record<string, ImageFileDraft>) => {
    draftsRef.current = next;
    setDrafts(next);
  }, []);

  useEffect(
    () => () => {
      Object.values(draftsRef.current).forEach((draft) =>
        URL.revokeObjectURL(draft.previewUrl),
      );
    },
    [],
  );

  const select = useCallback(
    (providerWarehouseId: string, file: File | null) => {
      setError(null);
      const existing = draftsRef.current[providerWarehouseId];
      if (!file) {
        if (existing) URL.revokeObjectURL(existing.previewUrl);
        const next = { ...draftsRef.current };
        delete next[providerWarehouseId];
        replaceDrafts(next);
        return;
      }

      const fileError = validateImageFile(file, {
        invalidType: 'La remisión debe ser una foto PNG, WEBP o JPEG.',
        tooLarge: 'Cada foto de remisión debe pesar máximo 10 MB.',
      });
      if (fileError) {
        setError(fileError);
        return;
      }

      if (existing) URL.revokeObjectURL(existing.previewUrl);
      replaceDrafts({
        ...draftsRef.current,
        [providerWarehouseId]: {
          id: `${providerWarehouseId}-${file.name}-${file.lastModified}`,
          file,
          previewUrl: URL.createObjectURL(file),
        },
      });
    },
    [replaceDrafts],
  );

  const clear = useCallback(() => {
    Object.values(draftsRef.current).forEach((draft) =>
      URL.revokeObjectURL(draft.previewUrl),
    );
    replaceDrafts({});
    setError(null);
  }, [replaceDrafts]);

  const upload = useCallback(
    async (documentId: string, providers: ProviderRemissionRequirement[]) => {
      const uploads = providers.flatMap((provider) => {
        const draft = draftsRef.current[provider.providerWarehouseId];
        if (!draft) return [];
        const formData = new FormData();
        formData.append('category', 'COMPROBANTE_SALIDA_PROVEEDOR');
        formData.append('displayName', `Remisión física de ${provider.providerName}`);
        formData.append('providerWarehouseId', provider.providerWarehouseId);
        formData.append('files', draft.file);
        return [api(`/files/entities/DOCUMENT/${documentId}`, { method: 'POST', body: formData })];
      });
      await Promise.all(uploads);
    },
    [],
  );

  return { drafts, error, setError, select, clear, upload };
};
