import { describe, it, expect } from 'vitest';
import { matchesFilters, matchesText, paginate } from './filtering';
import type { CollectionItem } from './types';

const item: CollectionItem = {
  id: '1',
  title: 'Icône de la Vierge',
  imageUrl: '',
  metadata: { category: 'icon', origin: 'UA', material: ['wood', 'gold'], maker: 'Atelier de Kyiv', height_cm: 40, period: 'medieval' }
};

describe('matchesFilters', () => {
  it('ignore les filtres vides', () => {
    expect(matchesFilters(item, { origin: '', material: [], maker: '' })).toBe(true);
  });
  it('OU à l’intérieur d’un filtre', () => {
    expect(matchesFilters(item, { origin: ['RU', 'UA'] })).toBe(true);
    expect(matchesFilters(item, { origin: ['RU', 'GR'] })).toBe(false);
  });
  it('ET entre filtres', () => {
    expect(matchesFilters(item, { origin: ['UA'], material: ['bronze'] })).toBe(false);
    expect(matchesFilters(item, { origin: ['UA'], material: ['gold'] })).toBe(true);
  });
  it('valeur multiple de l’objet : une seule correspondance suffit', () => {
    expect(matchesFilters(item, { material: ['gold'] })).toBe(true);
  });
  it('texte : contient, insensible à la casse', () => {
    expect(matchesFilters(item, { maker: 'KYIV' })).toBe(true);
    expect(matchesFilters(item, { maker: 'novgorod' })).toBe(false);
  });
  it('nombre : minimum', () => {
    expect(matchesFilters(item, { height_cm: '30' })).toBe(true);
    expect(matchesFilters(item, { height_cm: '50' })).toBe(false);
  });
});

describe('matchesText', () => {
  it('cherche dans le titre, les codes et les libellés traduits', () => {
    expect(matchesText(item, 'vierge', 'fr')).toBe(true);
    expect(matchesText(item, 'ukraine', 'fr')).toBe(true);
    expect(matchesText(item, 'ukraine', 'en')).toBe(true);
    expect(matchesText(item, 'moyen âge', 'fr')).toBe(true);
    expect(matchesText(item, 'middle ages', 'en')).toBe(true);
    expect(matchesText(item, 'porcelaine', 'fr')).toBe(false);
  });
  it('texte vide : tout passe', () => {
    expect(matchesText(item, '', 'fr')).toBe(true);
  });
});

describe('paginate', () => {
  it('découpe par page', () => {
    const list = Array.from({ length: 30 }, (_, i) => i);
    expect(paginate(list, 1, 12)).toHaveLength(12);
    expect(paginate(list, 3, 12)).toEqual([24, 25, 26, 27, 28, 29]);
    expect(paginate(list, 4, 12)).toEqual([]);
  });
});
