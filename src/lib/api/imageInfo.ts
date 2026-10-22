import exifr from 'exifr';

/**
 * Métadonnées et informations techniques d'une image, lues côté client.
 * Indicatives seulement : facilement absentes (réseaux sociaux, captures) ou falsifiables.
 * Le backend doit refaire l'extraction de référence.
 */
export interface ImageInfo {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  /** Orientation EXIF (1 = normale). */
  orientation?: number;
  /** Appareil (marque + modèle). */
  camera?: string;
  /** Logiciel ayant produit/retouché le fichier. */
  software?: string;
  /** Date de prise de vue. */
  takenAt?: Date;
  /** Position GPS si présente. */
  gps?: { latitude: number; longitude: number };
  /** Champs IPTC/XMP descriptifs. */
  author?: string;
  title?: string;
  description?: string;
  keywords?: string[];
  copyright?: string;
  /** Empreinte SHA-256 du fichier (dédoublonnage exact). */
  sha256?: string;
  /** true si aucune métadonnée EXIF/IPTC/XMP n'a été trouvée. */
  stripped: boolean;
}

async function sha256(file: File): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) return undefined;
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function dimensions(file: File): Promise<{ width: number; height: number } | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
    img.src = url;
  });
}

function asString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return v.map(String).join(', ');
  if (typeof v === 'object' && 'value' in (v as object)) return String((v as { value: unknown }).value);
  return String(v);
}

function asStringArray(v: unknown): string[] | undefined {
  if (!v) return undefined;
  return (Array.isArray(v) ? v : [v]).map(String).filter(Boolean);
}

export async function extractImageInfo(file: File): Promise<ImageInfo> {
  const [tags, dims, hash] = await Promise.all([
    exifr
      .parse(file, { tiff: true, exif: true, gps: true, iptc: true, xmp: true, icc: false, mergeOutput: true })
      .catch(() => undefined),
    dimensions(file),
    sha256(file)
  ]);

  const t = (tags ?? {}) as Record<string, unknown>;
  const make = asString(t.Make);
  const model = asString(t.Model);
  const camera = [make, model].filter(Boolean).join(' ').trim() || undefined;

  const lat = typeof t.latitude === 'number' ? t.latitude : undefined;
  const lon = typeof t.longitude === 'number' ? t.longitude : undefined;

  const takenAtRaw = t.DateTimeOriginal ?? t.CreateDate ?? t.DateCreated;
  const takenAt = takenAtRaw instanceof Date ? takenAtRaw : undefined;

  return {
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    width: dims?.width ?? (typeof t.ImageWidth === 'number' ? t.ImageWidth : undefined),
    height: dims?.height ?? (typeof t.ImageHeight === 'number' ? t.ImageHeight : undefined),
    orientation: typeof t.Orientation === 'number' ? t.Orientation : undefined,
    camera,
    software: asString(t.Software ?? t.CreatorTool),
    takenAt,
    gps: lat !== undefined && lon !== undefined ? { latitude: lat, longitude: lon } : undefined,
    author: asString(t.Artist ?? t.Creator ?? t['By-line'] ?? t.creator),
    title: asString(t.ObjectName ?? t.Headline ?? t.title),
    description: asString(t.ImageDescription ?? t.Caption ?? t.description),
    keywords: asStringArray(t.Keywords ?? t.subject),
    copyright: asString(t.Copyright ?? t.CopyrightNotice ?? t.rights),
    sha256: hash,
    stripped: !tags || Object.keys(tags).length === 0
  };
}

/** Copie de l'info sans la position GPS (respect de la vie privée de l'agent). */
export function withoutGps(info: ImageInfo): ImageInfo {
  const { gps: _gps, ...rest } = info;
  return rest;
}
