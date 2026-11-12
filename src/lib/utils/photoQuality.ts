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
  /**
   * Énergie des contours dans la bande extérieure (8 % de chaque bord) rapportée à l'énergie moyenne de l'image.
   * Objet entier sur fond uni : proche de 0. Objet coupé par le cadre, ou fond encombré jusqu'au bord : 0,6 et plus.
   * Dans les deux cas le conseil est le même : reculer, recentrer, fond uni.
   * Calculé seulement sur le flux caméra (prise de vue guidée).
   */
  borderEdges?: number;
}

export interface QualityPolicy {
  minSide: number;
  blur: number;
  dark: number;
  bright: number;
  lowContrast: number;
  clipped: number;
  /** Seuil de `borderEdges` au-delà duquel l'objet est considéré coupé par le cadre (prise de vue guidée). */
  cutEdges?: number;
  /** Inclinaison maximale tolérée, en degrés (prise de vue guidée, capteur d'orientation). */
  maxTilt?: number;
}

export type QualityIssueId = 'small' | 'blur' | 'dark' | 'bright' | 'glare' | 'flat' | 'cut';

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
  if (p.cutEdges !== undefined && m.borderEdges !== undefined && m.borderEdges > p.cutEdges) issues.push({ id: 'cut', value: m.borderEdges });
  return issues;
}

/** Mesures sur des pixels RGBA (w × h). `fullW`/`fullH` : taille d'origine, pour le test « image trop petite ». */
export function metricsFromImageData(data: Uint8ClampedArray, w: number, h: number, fullW = w, fullH = h, withBorder = false): PhotoMetrics {
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

  // Variance du laplacien (noyau 4-voisins), hors bords ; énergie dans la bande extérieure à part
  const band = Math.max(1, Math.round(Math.min(w, h) * 0.08));
  let lapSum = 0;
  let lapSq = 0;
  let count = 0;
  let bandSq = 0;
  let bandCount = 0;
  for (let y = 1; y < h - 1; y++) {
    const edgeRow = y < band || y >= h - band;
    for (let x = 1; x < w - 1; x++) {
      const c = y * w + x;
      const v = 4 * lum[c] - lum[c - 1] - lum[c + 1] - lum[c - w] - lum[c + w];
      lapSum += v;
      lapSq += v * v;
      count++;
      if (withBorder && (edgeRow || x < band || x >= w - band)) {
        bandSq += v * v;
        bandCount++;
      }
    }
  }
  const lapMean = count ? lapSum / count : 0;
  const lapVar = count ? lapSq / count - lapMean * lapMean : 0;
  const sharpness = lapVar / Math.max(1, std * std);
  const m: PhotoMetrics = { width: fullW, height: fullH, mean, std, clipped: clipped / n, sharpness };
  if (withBorder && count && bandCount) m.borderEdges = bandSq / bandCount / Math.max(1e-6, lapSq / count);
  return m;
}

function smallCanvas(w: number, h: number): { ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null } {
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  return { ctx: canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null };
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
  const { ctx } = smallCanvas(w, h);
  if (!ctx) {
    bmp.close();
    return null;
  }
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return metricsFromImageData(ctx.getImageData(0, 0, w, h).data, w, h, fullW, fullH);
}

/**
 * Mesures en direct sur une image du flux caméra (prise de vue guidée) : petite réduction (256 px) pour tenir
 * plusieurs fois par seconde, avec le test « objet coupé par le bord ».
 */
export function measureFrame(source: CanvasImageSource, srcW: number, srcH: number, maxPx = 256): PhotoMetrics | null {
  if (!srcW || !srcH) return null;
  const scale = Math.min(1, maxPx / Math.max(srcW, srcH));
  const w = Math.max(2, Math.round(srcW * scale));
  const h = Math.max(2, Math.round(srcH * scale));
  const { ctx } = smallCanvas(w, h);
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, w, h);
  return metricsFromImageData(ctx.getImageData(0, 0, w, h).data, w, h, srcW, srcH, true);
}
