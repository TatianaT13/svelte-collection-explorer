import type { UploadPolicy } from '$lib/config/schema';

/**
 * Réduit une image côté client avant envoi (photo de téléphone : 4 à 8 Mo → ~200 Ko).
 * - sous `skipBelowBytes`, le fichier part tel quel (aucune recompression) ;
 * - sinon, côté maximal `maxPx`, JPEG à `quality`, orientation EXIF conservée.
 * Retourne le fichier d'origine si impossible.
 */
export interface ResizeResult {
  file: File;
  width: number;
  height: number;
  resized: boolean;
}

export async function resizeImage(file: File, policy: UploadPolicy): Promise<ResizeResult> {
  const { maxPx, skipBelowBytes, quality } = policy;
  if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function' || file.size < skipBelowBytes) {
    return { file, width: 0, height: 0, resized: false };
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return { file, width: 0, height: 0, resized: false };
  }
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return { file, width: bitmap.width, height: bitmap.height, resized: false };
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) return { file, width, height, resized: false };
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return { file: new File([blob], name, { type: 'image/jpeg' }), width, height, resized: true };
}
