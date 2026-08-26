export type ImageFileDraft = {
  id: string;
  file: File;
  previewUrl: string;
};

export type ImageFileLike = Pick<File, 'name' | 'size' | 'type' | 'lastModified'>;

export const MAX_IMAGE_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_FILE_TYPES = new Set(['image/png', 'image/webp', 'image/jpeg']);

export const validateImageFile = (
  file: ImageFileLike,
  labels: { invalidType: string; tooLarge: string },
) => {
  if (!ALLOWED_IMAGE_FILE_TYPES.has(file.type)) return labels.invalidType;
  if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) return labels.tooLarge;
  return null;
};

export const validateOfflineFileDrafts = ({
  evidencePhotoCount,
  providerRemissionCount,
}: {
  evidencePhotoCount: number;
  providerRemissionCount: number;
}) => {
  if (evidencePhotoCount === 0 && providerRemissionCount === 0) return null;
  return 'Los archivos y fotografías todavía requieren conexión. Retíralos o envía el documento cuando vuelva la red.';
};
