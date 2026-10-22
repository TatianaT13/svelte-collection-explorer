import { describe, it, expect } from 'vitest';
import { readSearchState, writeSearchState } from './urlState';

describe('urlState', () => {
  it('lit texte, filtres multiples et page depuis les paramètres', () => {
    const s = readSearchState(new URLSearchParams('q=ic%C3%B4ne&origin=UA,RU&material=gold&maker=kyiv&p=3'));
    expect(s.text).toBe('icône');
    expect(s.filters.origin).toEqual(['UA', 'RU']);
    expect(s.filters.material).toEqual(['gold']);
    expect(s.filters.maker).toBe('kyiv');
    expect(s.page).toBe(3);
  });

  it('ignore une page invalide et les champs inconnus', () => {
    const s = readSearchState(new URLSearchParams('p=abc&unknown=1'));
    expect(s.page).toBe(1);
    expect(s.filters).toEqual({});
  });

  it('écrit puis relit sans perte', () => {
    const state = { text: 'or', filters: { origin: ['UA', 'GR'], material: [], maker: '' }, page: 2 };
    const url = writeSearchState(new URL('https://x.test/base/?old=1'), state);
    expect(url.searchParams.get('old')).toBeNull();
    expect(url.searchParams.get('origin')).toBe('UA,GR');
    expect(url.searchParams.has('material')).toBe(false);
    expect(url.searchParams.has('maker')).toBe(false);
    const back = readSearchState(url.searchParams);
    expect(back.text).toBe('or');
    expect(back.filters.origin).toEqual(['UA', 'GR']);
    expect(back.page).toBe(2);
  });

  it('omet p=1 pour garder une URL propre', () => {
    const url = writeSearchState(new URL('https://x.test/'), { text: '', filters: {}, page: 1 });
    expect(url.search).toBe('');
  });
});
