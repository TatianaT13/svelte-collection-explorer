/** Le seuil τ en vigueur, lu dans le même fichier que le schéma de l'application (ligne α = 0,1). */
import { readFile } from 'node:fs/promises';
const report = JSON.parse(await readFile('eval/calibration-clip.json', 'utf8'));
export const schema = { tau: report.thresholds.find((t) => t.alpha === 0.1)?.tau ?? 0.75, model: report.model };
