import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CollectionItem } from '#lib/api/types.ts';

vi.mock('$app/env', () => ({ browser: true }));

const item = (id: string): CollectionItem => ({ id, title: id, imageUrl: '', metadata: {} });
function fakeStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), raw: m };
}
async function fresh() {
  vi.resetModules();
  return (await import('./compare.svelte')).compare;
}

describe('compare : la sélection pour comparaison', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', fakeStorage());
  });

  it('ajoute, retire, plafonne à quatre', async () => {
    const c = await fresh();
    for (const id of ['a', 'b', 'c', 'd', 'e']) c.toggle(item(id));
    expect(c.count).toBe(4);
    expect(c.isFull).toBe(true);
    expect(c.has('e')).toBe(false);
    c.toggle(item('b'));
    expect(c.items.map((i) => i.id)).toEqual(['a', 'c', 'd']);
    c.remove('a');
    expect(c.count).toBe(2);
    c.clear();
    expect(c.count).toBe(0);
  });

  it('survit à un rechargement via la session', async () => {
    const c = await fresh();
    c.toggle(item('x'));
    const again = await fresh();
    expect(again.has('x')).toBe(true);
  });
});
