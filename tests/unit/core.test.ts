import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { formatCash, resolveLocale, t } from '../../src/core/i18n';
import { rollRarity, computeOvr, createTrainee } from '../../src/sim/players';
import { BALANCE } from '../../src/data/balance';
import { FakeClock, RealClock } from '../../src/core/clock';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('state can be saved and restored', () => {
    const a = new Rng(7);
    a.next();
    const b = new Rng(a.state);
    expect(b.next()).toBe(a.next());
  });
});

describe('rarity rolls', () => {
  it('match the 70/22/7/1 table', () => {
    const rng = new Rng(123);
    const n = 200000;
    const c = { common: 0, rare: 0, epic: 0, wonderkid: 0 };
    for (let i = 0; i < n; i++) c[rollRarity(rng)]++;
    expect(c.common / n).toBeCloseTo(0.7, 1);
    expect(c.rare / n).toBeCloseTo(0.22, 1);
    expect(Math.abs(c.epic / n - 0.07)).toBeLessThan(0.01);
    expect(Math.abs(c.wonderkid / n - 0.01)).toBeLessThan(0.003);
  });
  it('scouting bonus raises rare+ odds', () => {
    const rng = new Rng(5);
    let base = 0;
    let boosted = 0;
    for (let i = 0; i < 20000; i++) if (rollRarity(rng) !== 'common') base++;
    for (let i = 0; i < 20000; i++) if (rollRarity(rng, 30) !== 'common') boosted++;
    expect(boosted).toBeGreaterThan(base * 1.5);
  });
  it('trainees respect rarity caps and age range', () => {
    const rng = new Rng(9);
    for (let i = 0; i < 500; i++) {
      const tr = createTrainee(rng, i + 1, 0, 0);
      expect(tr.age).toBeGreaterThanOrEqual(12);
      expect(tr.age).toBeLessThanOrEqual(17);
      expect(tr.gradOvr).toBeLessThanOrEqual(BALANCE.rarity.cap[tr.rarity]);
      expect(computeOvr(tr.position, tr.stats)).toBe(tr.startOvr);
    }
  });
});

describe('i18n', () => {
  it('interpolates and pluralises', () => {
    expect(t('obj.sign', { name: 'Leo' })).toBe('Sign Leo');
    expect(t('trainee.count', { count: 1 })).toBe('1 trainee');
    expect(t('trainee.count', { count: 3 })).toBe('3 trainees');
    expect(t('missing.key')).toBe('missing.key');
  });
  it('abbreviates cash', () => {
    expect(formatCash(950)).toBe('$950');
    expect(formatCash(9999)).toBe('$9,999');
    expect(formatCash(12400)).toBe('$12.4K');
    expect(formatCash(1_234_567)).toBe('$1.2M');
  });
  it('resolves locales with English fallback', () => {
    expect(resolveLocale([undefined, 'en-GB'])).toBe('en');
    expect(resolveLocale(['xx-YY'])).toBe('en');
  });
});

describe('clock', () => {
  it('supports skipping time', () => {
    const c = new RealClock();
    const a = c.now();
    c.skip(3600_000);
    expect(c.now() - a).toBeGreaterThanOrEqual(3600_000);
    const f = new FakeClock(1000);
    f.advance(500);
    expect(f.now()).toBe(1500);
  });
});
