import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$app/env', () => ({ browser: true }));

/** sessionStorage minimal, pour vérifier ce qui est réellement persisté. */
function fakeStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), raw: m };
}

async function fresh() {
  vi.resetModules();
  return (await import('./query.svelte')).lastQuery;
}
const info = { fileName: 'p.jpg', mimeType: 'image/jpeg', sizeBytes: 1234, sha256: 'deadbeef', camera: 'Pixel', takenAt: new Date('2026-11-01T10:00:00Z'), stripped: false };

describe('lastQuery : la photo de référence et la décision', () => {
  let storage: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal('sessionStorage', storage);
  });

  it('enregistre la photo sans l’image, avec empreinte, appareil et date', async () => {
    const q = await fresh();
    q.set(info, true);
    expect(q.record).toMatchObject({ fileName: 'p.jpg', sizeBytes: 1234, sha256: 'deadbeef', camera: 'Pixel', cropped: true, takenAt: '2026-11-01T10:00:00.000Z' });
    expect(q.record?.decision).toBeUndefined();
    const persisted = JSON.parse(storage.raw.get('last-query')!);
    expect(persisted.sha256).toBe('deadbeef');
    expect(JSON.stringify(persisted)).not.toMatch(/data:image|blob/);
  });

  it('la décision est horodatée, garde le résumé, et s’annule sans perdre la photo', async () => {
    const q = await fresh();
    q.set(info, false);
    q.decide('hold', { origins: [{ code: 'UA', share: 0.8 }], category: 'icon', risk: ['ukraine'] });
    expect(q.record?.decision).toBe('hold');
    expect(q.record?.decidedAt).toMatch(/^\d{4}-/);
    expect(q.record?.summary?.risk).toEqual(['ukraine']);
    q.decide(null);
    expect(q.record?.decision).toBeUndefined();
    expect(q.record?.summary?.category).toBe('icon'); // le résumé survit à l’annulation
    expect(q.record?.sha256).toBe('deadbeef');
  });

  it('se relit depuis la session au rechargement, et clear efface tout', async () => {
    const q = await fresh();
    q.set(info, false);
    q.decide('expert');
    const again = await fresh();
    expect(again.record?.decision).toBe('expert');
    again.clear();
    expect(again.record).toBeNull();
    expect(storage.raw.has('last-query')).toBe(false);
  });

  it('decide sans photo ne fait rien', async () => {
    const q = await fresh();
    q.decide('release');
    expect(q.record).toBeNull();
  });
});
