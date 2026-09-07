'use client';
import { api } from '@/lib/api';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  ALLOWED_EVIDENCE_PHOTO_TYPES,
  MAX_EVIDENCE_PHOTO_COUNT,
  MAX_EVIDENCE_PHOTO_SIZE_BYTES,
} from './request-formatting';
import {
  EvidencePhotoDraft,
  ProviderRemissionModalState,
  ProviderRemissionRequirement,
  ProviderRemissionRequirements,
} from './request-types';

type Options = {
  setError: Dispatch<SetStateAction<string | null>>;
  setProviderRemissionError: Dispatch<SetStateAction<string | null>>;
  setCreationProviderRequirements: Dispatch<
    SetStateAction<ProviderRemissionRequirements | null>
  >;
  setProviderRemissionModal: Dispatch<
    SetStateAction<ProviderRemissionModalState | null>
  >;
};

export function useRequestFiles({
  setError,
  setProviderRemissionError,
  setCreationProviderRequirements,
  setProviderRemissionModal,
}: Options) {
  const [evidencePhotos, setEvidencePhotos] = useState<EvidencePhotoDraft[]>(
    [],
  );

  const [providerRemissionDrafts, setProviderRemissionDrafts] = useState<
    Record<string, EvidencePhotoDraft>
  >({});

  const evidenceInputRef = useRef<HTMLInputElement | null>(null);

  const evidencePhotosRef = useRef<EvidencePhotoDraft[]>([]);

  const providerRemissionDraftsRef = useRef<Record<string, EvidencePhotoDraft>>(
    {},
  );

  useEffect(() => {
    evidencePhotosRef.current = evidencePhotos;
  }, [evidencePhotos]);

  useEffect(() => {
    return () => {
      evidencePhotosRef.current.forEach((photo) =>
        URL.revokeObjectURL(photo.previewUrl),
      );
    };
  }, []);

  useEffect(() => {
    providerRemissionDraftsRef.current = providerRemissionDrafts;
  }, [providerRemissionDrafts]);

  useEffect(() => {
    return () => {
      Object.values(providerRemissionDraftsRef.current).forEach((draft) =>
        URL.revokeObjectURL(draft.previewUrl),
      );
    };
  }, []);

  const addEvidencePhotos = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setError(null);
    const nextPhotos: EvidencePhotoDraft[] = [];
    Array.from(fileList).forEach((file) => {
      if (!ALLOWED_EVIDENCE_PHOTO_TYPES.has(file.type)) {
        setError('Las evidencias deben ser fotos PNG, WEBP o JPEG.');
        return;
      }
      if (file.size > MAX_EVIDENCE_PHOTO_SIZE_BYTES) {
        setError('Cada foto de evidencia debe pesar maximo 10 MB.');
        return;
      }
      nextPhotos.push({
        id: `${file.name}-${file.lastModified}-${Date.now()}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    });
    if (!nextPhotos.length) return;

    const availableSlots = MAX_EVIDENCE_PHOTO_COUNT - evidencePhotos.length;
    if (availableSlots <= 0) {
      nextPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      setError(
        `Puedes adjuntar maximo ${MAX_EVIDENCE_PHOTO_COUNT} fotos por solicitud.`,
      );
      return;
    }

    const accepted = nextPhotos.slice(0, availableSlots);
    nextPhotos
      .slice(availableSlots)
      .forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    if (accepted.length < nextPhotos.length) {
      setError(
        `Solo se agregaron ${accepted.length} fotos. El maximo es ${MAX_EVIDENCE_PHOTO_COUNT}.`,
      );
    }
    setEvidencePhotos((prev) => [...prev, ...accepted]);
    if (evidenceInputRef.current) {
      evidenceInputRef.current.value = '';
    }
  };

  const removeEvidencePhoto = (photoId: string) => {
    setEvidencePhotos((prev) => {
      const photo = prev.find((entry) => entry.id === photoId);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return prev.filter((entry) => entry.id !== photoId);
    });
  };

  const clearEvidencePhotos = () => {
    setEvidencePhotos((prev) => {
      prev.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      return [];
    });
    if (evidenceInputRef.current) {
      evidenceInputRef.current.value = '';
    }
  };

  const uploadEvidencePhotos = async (documentId: string) => {
    if (!evidencePhotos.length) return;
    const formData = new FormData();
    evidencePhotos.forEach((photo) => {
      formData.append('photos', photo.file);
    });
    await api(`/files/documents/${documentId}/evidence`, {
      method: 'POST',
      body: formData,
    });
  };

  const selectProviderRemissionDocument = (
    providerWarehouseId: string,
    file: File | null,
  ) => {
    setProviderRemissionError(null);
    if (!file) {
      setProviderRemissionDrafts((current) => {
        const existing = current[providerWarehouseId];
        if (existing) URL.revokeObjectURL(existing.previewUrl);
        const next = { ...current };
        delete next[providerWarehouseId];
        return next;
      });
      return;
    }
    if (!ALLOWED_EVIDENCE_PHOTO_TYPES.has(file.type)) {
      setProviderRemissionError(
        'La remisión debe ser una foto PNG, WEBP o JPEG.',
      );
      return;
    }
    if (file.size > MAX_EVIDENCE_PHOTO_SIZE_BYTES) {
      setProviderRemissionError(
        'Cada foto de remisión debe pesar máximo 10 MB.',
      );
      return;
    }
    setProviderRemissionDrafts((current) => {
      const existing = current[providerWarehouseId];
      if (existing) URL.revokeObjectURL(existing.previewUrl);
      return {
        ...current,
        [providerWarehouseId]: {
          id: `${providerWarehouseId}-${file.name}-${file.lastModified}`,
          file,
          previewUrl: URL.createObjectURL(file),
        },
      };
    });
  };

  const clearProviderRemissionDocuments = () => {
    setProviderRemissionDrafts((current) => {
      Object.values(current).forEach((draft) =>
        URL.revokeObjectURL(draft.previewUrl),
      );
      return {};
    });
    setCreationProviderRequirements(null);
    setProviderRemissionModal(null);
    setProviderRemissionError(null);
  };

  const uploadProviderRemissionDocuments = async (
    documentId: string,
    providers: ProviderRemissionRequirement[],
  ) => {
    const uploads = providers.flatMap((provider) => {
      const draft = providerRemissionDrafts[provider.providerWarehouseId];
      if (!draft) return [];
      const formData = new FormData();
      formData.append('category', 'COMPROBANTE_SALIDA_PROVEEDOR');
      formData.append(
        'displayName',
        `Remisión física de ${provider.providerName}`,
      );
      formData.append('providerWarehouseId', provider.providerWarehouseId);
      formData.append('files', draft.file);
      return [
        api(`/files/entities/DOCUMENT/${documentId}`, {
          method: 'POST',
          body: formData,
        }),
      ];
    });
    await Promise.all(uploads);
  };
  return {
    evidencePhotos,
    providerRemissionDrafts,
    evidenceInputRef,
    addEvidencePhotos,
    removeEvidencePhoto,
    clearEvidencePhotos,
    uploadEvidencePhotos,
    selectProviderRemissionDocument,
    clearProviderRemissionDocuments,
    uploadProviderRemissionDocuments,
  };
}
