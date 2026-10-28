/**
 * Preparación de fotos. Una foto de teléfono pesa 3 a 8 MB; para leer una pizarra sobra con
 * 1920 px de lado largo en JPEG. Reducirla evita llenar el almacenamiento del teléfono.
 * Si algo falla al reducirla, se conserva la original: una foto nunca se pierde por esto.
 */
export const MAX_SIDE = 1920;
export const JPEG_QUALITY = 0.82;
/** Límite de seguridad por foto ya preparada. */
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

export interface PreparedImage {
  blob: Blob;
  mime: string;
  /** true si se redujo; false si se guardó tal cual. */
  resized: boolean;
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const original: PreparedImage = { blob: file, mime: file.type || 'image/jpeg', resized: false };
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return original;
  let bitmap: ImageBitmap | undefined;
  try {
    // "from-image" respeta la rotación que guardó la cámara.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    // Ya es pequeña y ligera: no se vuelve a comprimir (cada compresión pierde calidad).
    if (scale === 1 && file.size <= 1.5 * 1024 * 1024 && file.type === 'image/jpeg')
      return original;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return original;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob || blob.size === 0 || blob.size >= file.size) return original;
    return { blob, mime: 'image/jpeg', resized: true };
  } catch {
    return original;
  } finally {
    bitmap?.close();
  }
}
