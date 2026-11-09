import { describe, it, expect, vi } from 'vitest';
import { buildCaseFile, caseFileName } from './caseFile';
import { lastQuery } from '#lib/stores/query.svelte.ts';
import type { CollectionItem, Insights } from '#lib/api/types.ts';

const item: CollectionItem = { id: '1', title: 'Icône', imageUrl: 'i.jpg', score: 0.91, metadata: { category: 'icon', origin: 'UA', material: ['wood'] } };
const insights: Insights = { topK: 1, origins: [{ code: 'UA', share: 1, count: 1 }], places: [], categories: [{ code: 'icon', share: 1, count: 1 }], materials: [], techniques: [], subjects: [], periods: [], references: [{ id: '1', title: 'Icône', score: 0.91 }] };

describe('dossier de contrôle exporté', () => {
  it('porte la photo de référence sans l’image, la lecture et les candidats avec leurs listes rouges', () => {
    lastQuery.set({ fileName: 'p.jpg', mimeType: 'image/jpeg', sizeBytes: 10, sha256: 'ff00', stripped: true }, false);
    const dossier = buildCaseFile([item], insights, { model: 'Xenova/clip-vit-base-patch32', dim: 512, count: 64, generatedAt: '2026-10-28T08:00:56.182Z', engine: 'browser' });
    expect(dossier.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Rejouable : modèle + révision du navigateur, base interrogée, seuils en vigueur
    expect(dossier.engine.revision).toMatch(/^[0-9a-f]{40}$/);
    expect(dossier.dataset?.count).toBe(64);
    expect(dossier.thresholds.calibration?.tau).toBeGreaterThan(0.5);
    expect(dossier.reading?.bestScore).toBe(0.91);
    expect(dossier.reading?.reliable).toBe(true);
    expect(dossier.reading?.risks.length).toBeGreaterThan(0);
    expect(dossier.referencePhoto?.sha256).toBe('ff00');
    expect(dossier.reading?.origins[0].code).toBe('UA');
    expect(dossier.candidates[0]).toMatchObject({ id: '1', score: 0.91, metadata: { category: 'icon' } });
    expect(dossier.candidates[0].redLists.length).toBeGreaterThan(0); // icône d’Ukraine : liste rouge ICOM
    expect(JSON.stringify(dossier)).not.toMatch(/data:image/);
  });

  it('sans lecture, le dossier n’en invente pas', () => {
    expect(buildCaseFile([], null).reading).toBeUndefined();
  });

  it('le nom de fichier est horodaté à la seconde', () => {
    vi.useFakeTimers({ now: new Date('2026-11-09T10:20:30Z') });
    expect(caseFileName()).toBe('dossier-2026-11-09-10-20-30.json');
    vi.useRealTimers();
  });
});
