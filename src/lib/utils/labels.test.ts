import { describe, it, expect } from 'vitest';
import { formatValue, labelOf, fieldLabel } from './labels';
import { schema } from '$lib/config/schema';
import { i18n } from '$lib/i18n/index.svelte';

const field = (key: string) => schema.fields.find((f) => f.key === key)!;

describe('labels', () => {
  it('traduit pays et vocabulaires dans la langue courante', () => {
    i18n.set('fr');
    expect(labelOf(field('origin'), 'UA')).toBe('Ukraine');
    expect(labelOf(field('material'), 'gold')).toBe('Or');
    i18n.set('en');
    expect(labelOf(field('material'), 'gold')).toBe('Gold');
    expect(fieldLabel(field('category'))).toBe('Object type');
    i18n.set('fr');
  });
  it('formate tableaux, unités et vides', () => {
    expect(formatValue(field('material'), ['wood', 'gold'])).toBe('Bois, Or');
    expect(formatValue(field('height_cm'), 12)).toBe('12 cm');
    expect(formatValue(field('maker'), '')).toBe('—');
    expect(formatValue(field('material'), [])).toBe('—');
  });
  it('un code inconnu reste affiché tel quel', () => {
    expect(labelOf(field('material'), 'unobtainium')).toBe('unobtainium');
  });
});
