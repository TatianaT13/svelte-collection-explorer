/**
 * Contrôle qualité d'une photo avant analyse, calculé dans le navigateur sur une
 * version réduite (≤ 512 px). Les seuils sont dans `schema.photoQuality`.
 * Rien ne bloque : on prévient l'agent et on conseille un geste concret.
 */
export interface PhotoMetrics {
  width: number;
  height: number;
  /** Luminance moyenne 0..255. */
  mean: number;
  /** Écart-type de la luminance (contraste). */
  std: number;
  /** Part de pixels saturés (> 250). */
  clipped: number;
  /**
   * Netteté : variance du laplacien rapportée à la variance de luminance.
   * Sans dimension, donc indépendante de l'exposition : une photo sombre n'est pas « floue » par défaut.
   */
  sharpness: number;
}

export interface QualityPolicy {
  minSide: number;
  blur: number;
  dark: number;
  bright: number;
  lowContrast: number;
  clipped: number;
}

export type QualityIssueId = 'small' | 'blur' | 'dark' | 'bright' | 'glare' | 'flat';

export interface QualityIssue {
  id: QualityIssueId;
  /** Valeur mesurée, pour l'affichage. */
  value: number;
}

/** Évaluation pure, testable. */
export function assessPhoto(m: PhotoMetrics, p: QualityPolicy): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (Math.min(m.width, m.height) < p.minSide) issues.push({ id: 'small', value: Math.min(m.width, m.height) });
  if (m.sharpness < p.blur) issues.push({ id: 'blur', value: m.sharpness });
  if (m.mean < p.dark) issues.push({ id: 'dark', value: m.mean });
  else if (m.mean > p.bright) issues.push({ id: 'bright', value: m.mean });
  if (m.clipped > p.clipped) issues.push({ id: 'glare', value: m.clipped });
  if (m.std < p.lowContrast && !issues.some((i) => i.id === 'dark' || i.id === 'bright')) issues.push({ id: 'flat', value: m.std });
  return issues;
}

/** Mesures sur une image réduite. Retourne null si l'image est illisible. */
export async function measurePhoto(file: Blob, maxPx = 512): Promise<PhotoMetrics | null> {
  if (typeof createImageBitmap !== 'function') return null;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  const fullW = bmp.width;
  const fullH = bmp.height;
  const scale = Math.min(1, maxPx / Math.max(fullW, fullH));
  const w = Math.max(2, Math.round(fullW * scale));
  const h = Math.max(2, Math.round(fullH * scale));
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) {
    bmp.close();
    return null;
  }
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const { data } = ctx.getImageData(0, 0, w, h);

  // Luminance
  const lum = new Float32Array(w * h);
  let sum = 0;
  let clipped = 0;
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    lum[j] = y;
    sum += y;
    if (y > 250) clipped++;
  }
  const n = w * h;
  const mean = sum / n;
  let varSum = 0;
  for (let j = 0; j < n; j++) varSum += (lum[j] - mean) ** 2;
  const std = Math.sqrt(varSum / n);

  // Variance du laplacien (noyau 4-voisins), hors bords
  let lapSum = 0;
  let lapSq = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const c = y * w + x;
      const v = 4 * lum[c] - lum[c - 1] - lum[c + 1] - lum[c - w] - lum[c + w];
      lapSum += v;
      lapSq += v * v;
      count++;
    }
  }
  const lapMean = count ? lapSum / count : 0;
  const lapVar = count ? lapSq / count - lapMean * lapMean : 0;
  const sharpness = lapVar / Math.max(1, std * std);

  return { width: fullW, height: fullH, mean, std, clipped: clipped / n, sharpness };
}
