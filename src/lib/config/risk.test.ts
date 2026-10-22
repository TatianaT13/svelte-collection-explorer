import { describe, it, expect } from 'vitest';
import { riskForCodes, riskRules } from './risk';

describe('risk', () => {
  it('icône ukrainienne : liste d’urgence Ukraine', () => {
    const r = riskForCodes('UA', 'icon');
    expect(r.map((x) => x.id)).toContain('icom-ua-2022');
    expect(r[0].emergency).toBe(true);
  });
  it('tableau français : aucune liste', () => {
    expect(riskForCodes('FR', 'painting')).toEqual([]);
  });
  it('valeurs manquantes : rien', () => {
    expect(riskForCodes(undefined, 'icon')).toEqual([]);
    expect(riskForCodes('UA', undefined)).toEqual([]);
  });
  it('chaque règle a un libellé bilingue et une source', () => {
    for (const r of riskRules) {
      expect(r.label.fr && r.label.en).toBeTruthy();
      expect(r.advice.fr && r.advice.en).toBeTruthy();
      expect(r.url).toMatch(/^https:\/\//);
    }
  });
});
