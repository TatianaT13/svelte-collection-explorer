/** Si l'image grand format ne charge pas (hors ligne, lien cassé), on affiche la vignette locale. */
export function fallbackToThumb(e: Event, thumb?: string) {
  const img = e.currentTarget as HTMLImageElement | null;
  if (!img || !thumb) return;
  if (!img.src.endsWith(thumb)) img.src = thumb;
}
