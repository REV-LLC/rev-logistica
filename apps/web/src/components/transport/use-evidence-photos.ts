'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import {
  type ImageFileDraft,
  validateImageFile,
} from '@/components/transport/file-drafts';

const MAX_EVIDENCE_PHOTO_COUNT = 12;

export const useEvidencePhotos = () => {
  const [photos, setPhotos] = useState<ImageFileDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const photosRef = useRef<ImageFileDraft[]>([]);

  const replacePhotos = useCallback((next: ImageFileDraft[]) => {
    photosRef.current = next;
    setPhotos(next);
  }, []);

  useEffect(
    () => () => {
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    },
    [],
  );

  const add = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return;

      let validationError: string | null = null;
      const drafts = Array.from(fileList).flatMap((file) => {
        const fileError = validateImageFile(file, {
          invalidType: 'Las evidencias deben ser fotos PNG, WEBP o JPEG.',
          tooLarge: 'Cada foto de evidencia debe pesar máximo 10 MB.',
        });
        if (fileError) {
          validationError ??= fileError;
          return [];
        }
        return [{
          id: `${file.name}-${file.lastModified}-${Date.now()}-${Math.random()}`,
          file,
          previewUrl: URL.createObjectURL(file),
        }];
      });

      const availableSlots = MAX_EVIDENCE_PHOTO_COUNT - photosRef.current.length;
      const accepted = drafts.slice(0, Math.max(availableSlots, 0));
      drafts.slice(accepted.length).forEach((photo) => URL.revokeObjectURL(photo.previewUrl));

      if (availableSlots <= 0) {
        setError(`Puedes adjuntar máximo ${MAX_EVIDENCE_PHOTO_COUNT} fotos por solicitud.`);
        return;
      }
      if (accepted.length < drafts.length) {
        validationError = `Solo se agregaron ${accepted.length} fotos. El máximo es ${MAX_EVIDENCE_PHOTO_COUNT}.`;
      }
      setError(validationError);
      if (accepted.length) replacePhotos([...photosRef.current, ...accepted]);
    },
    [replacePhotos],
  );

  const remove = useCallback(
    (photoId: string) => {
      const photo = photosRef.current.find((entry) => entry.id === photoId);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      replacePhotos(photosRef.current.filter((entry) => entry.id !== photoId));
      setError(null);
    },
    [replacePhotos],
  );

  const clear = useCallback(() => {
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    replacePhotos([]);
    setError(null);
  }, [replacePhotos]);

  const upload = useCallback(async (documentId: string) => {
    if (!photosRef.current.length) return;
    const formData = new FormData();
    photosRef.current.forEach((photo) => formData.append('photos', photo.file));
    await api(`/files/documents/${documentId}/evidence`, {
      method: 'POST',
      body: formData,
    });
  }, []);

  return { photos, error, add, remove, clear, upload };
};
