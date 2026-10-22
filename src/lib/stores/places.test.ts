import { describe, it, expect, beforeAll } from 'vitest';
import { places } from './places.svelte';
import { matchesFilters } from '$lib/api/filtering';
import type { CollectionItem } from '$lib/api/types';

beforeAll(() => {
  places.set({
    Q212: { id: 'Q212', label: { fr: 'Ukraine', en: 'Ukraine' }, countryIso: 'UA', lat: 49, lon: 32 },
    Q1899: { id: 'Q1899', label: { fr: 'Kyiv', en: 'Kyiv' }, parent: 'Q212', countryIso: 'UA', lat: 50.45, lon: 30.52 },
    Q7835: { id: 'Q7835', label: { fr: 'Crimée', en: 'Crimea' }, parent: 'Q212', countryIso: 'UA', lat: 45.3, lon: 34.4 },
    Q159: { id: 'Q159', label: { fr: 'Russie', en: 'Russia' }, countryIso: 'RU', lat: 60, lon: 100 }
  });
});

const item = (place: string): CollectionItem => ({ id: place, title: place, imageUrl: '', metadata: { place } });

describe('places', () => {
  it('chaîne et libellés', () => {
    expect(places.chain('Q1899').map((n) => n.id)).toEqual(['Q1899', 'Q212']);
    expect(places.label('Q1899', 'fr')).toBe('Kyiv, Ukraine');
    expect(places.label('Q212', 'fr')).toBe('Ukraine');
    expect(places.fullLabel('Q1899', 'en')).toBe('Kyiv · Ukraine');
    expect(places.isCountry('Q212')).toBe(true);
    expect(places.isCountry('Q1899')).toBe(false);
  });
  it('un filtre sur le pays inclut ses lieux ; un filtre sur une ville n’inclut pas le pays', () => {
    expect(matchesFilters(item('Q1899'), { place: ['Q212'] })).toBe(true);
    expect(matchesFilters(item('Q7835'), { place: ['Q212'] })).toBe(true);
    expect(matchesFilters(item('Q212'), { place: ['Q1899'] })).toBe(false);
    expect(matchesFilters(item('Q1899'), { place: ['Q159'] })).toBe(false);
  });
  it('options triées par pays puis profondeur, indentées', () => {
    const names = places.options('fr').map((o) => o.name);
    expect(names[0]).toBe('Russie');
    expect(names[1]).toBe('Ukraine');
    expect(names.slice(2)).toEqual(['   Crimée', '   Kyiv']);
  });
});
