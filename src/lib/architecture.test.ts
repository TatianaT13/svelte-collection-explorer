import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * La page static/architecture.html est entretenue à la main : chaque brique cite ses fichiers dans `file`.
 * Ce test garde la page et le code alignés : tout fichier cité existe, et tout fichier de src/ apparaît.
 */
const html = readFileSync('static/architecture.html', 'utf8');
const labels = [...html.matchAll(/file: '([^']*)'/g)].map((m) => m[1]);

/** Mentions qui ne désignent pas un fichier du dépôt (outil, service, dossier produit à l'exécution). */
const NOT_FILES = new Set(['GitHub Pages', 'hnswlib', 'vitest', 'service/archive/', 'eval/pairs', 'eval/calibration-*.json']);
const SUFFIXES = ['', '.ts', '.svelte', '.svelte.ts', '.mjs', '.py'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'thumbs' && name !== 'samples') walk(p, out);
    } else out.push(p);
  }
  return out;
}
const repoFiles = ['src', 'scripts', 'experiments', 'service', 'e2e', 'static/data', '.github'].flatMap((d) => walk(d));
const stem = (p: string) => basename(p).replace(/\.(svelte\.ts|ts|svelte|mjs|py)$/, '');

/** Résout une mention en chemin existant : chemin donné, chemin sous src/lib, voisin de la mention précédente, ou nom de fichier unique. */
function resolve(token: string, previous: string | null): string | null {
  const candidates = token.includes('/') ? [token, `src/lib/${token}`, `src/${token}`] : previous ? [join(dirname(previous), token)] : [];
  for (const c of candidates) for (const s of SUFFIXES) if (existsSync(c + s)) return c + s;
  const byName = repoFiles.filter((f) => stem(f) === token.replace(/\.[a-z.]+$/, '') || basename(f) === token);
  return byName.length === 1 ? byName[0] : null;
}

const cited = new Set<string>();
const unresolved: string[] = [];
for (const label of labels) {
  let previous: string | null = null;
  for (const raw of label.split(/ · | → /)) {
    const token = raw.replace(/\s*\(.*\)\s*$/, '').trim();
    if (!token || NOT_FILES.has(token) || /[ =]/.test(token)) continue;
    const path = resolve(token, previous);
    if (path) {
      cited.add(path.replace(/\/$/, ''));
      previous = path;
    } else unresolved.push(`${token}  (dans « ${label} »)`);
  }
}

describe('architecture.html', () => {
  it('ne cite que des fichiers qui existent', () => {
    expect(unresolved).toEqual([]);
  });
  it('cite chaque fichier de src/ (hors tests et déclarations de types)', () => {
    const missing = walk('src')
      .filter((f) => !/\.test\.ts$|\.d\.ts$/.test(f))
      .filter((f) => !cited.has(f) && ![...cited].some((c) => f.startsWith(c + '/')));
    expect(missing).toEqual([]);
  });
});
