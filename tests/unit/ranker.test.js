import { describe, expect, it } from 'vitest';
import { estimateStability, rankCandidates, scoreCandidate } from '../../src/engine/ranker.js';

const unique = { status: 'verified', matchCount: 1, isUnique: true, matchesTarget: true, targetIncluded: true, targetIndex: 0, error: null };
const multiple = (count, index = 0) => ({ status: 'verified', matchCount: count, isUnique: false, matchesTarget: false, targetIncluded: true, targetIndex: index, error: null });

const candidate = (overrides) => ({
  kind: 'css',
  value: '#x',
  options: {},
  basis: 'id',
  frameworks: ['playwright'],
  traits: { attributeStability: 0.9, depth: 0, positional: false },
  validation: unique,
  ...overrides,
});

describe('scoreCandidate', () => {
  it('rates a unique, stable test id highly', () => {
    const result = scoreCandidate(candidate({ kind: 'testid', basis: 'testid', value: 'login', traits: { attributeStability: 0.95 } }));
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.rating).toBe('good');
    expect(result.stabilityLevel).toBe('high');
  });

  it('never rates a non-unique locator above fragile', () => {
    const result = scoreCandidate(candidate({ kind: 'testid', basis: 'testid', validation: multiple(3, 1) }));
    expect(result.rating).toBe('fragile');
    expect(result.score).toBeLessThanOrEqual(40);
    expect(result.explanation).toMatch(/3 elements; the selected one is #2/);
  });

  it('marks unvalidated and erroring candidates as unverified', () => {
    expect(scoreCandidate(candidate({ validation: undefined })).rating).toBe('unverified');
    expect(scoreCandidate(candidate({ validation: { ...unique, status: 'error', error: 'bad', matchesTarget: false } })).rating).toBe('unverified');
  });

  it('marks candidates that miss the target as fragile', () => {
    const result = scoreCandidate(candidate({ validation: { ...unique, matchesTarget: false, targetIncluded: false } }));
    expect(result.rating).toBe('fragile');
    expect(result.score).toBeLessThanOrEqual(5);
  });

  it('penalises dynamic ids, positional indexes and absolute paths', () => {
    const stableId = scoreCandidate(candidate({}));
    const dynamicId = scoreCandidate(candidate({ traits: { attributeStability: 0.15 } }));
    const positional = scoreCandidate(candidate({ kind: 'xpath', basis: 'structure', traits: { attributeStability: 0.3, positional: true } }));
    const absolute = scoreCandidate(candidate({ kind: 'xpath', basis: 'absolute', traits: { attributeStability: 0.05, absolute: true, positional: true } }));
    expect(stableId.score).toBeGreaterThan(dynamicId.score);
    expect(dynamicId.score).toBeGreaterThan(positional.score);
    expect(positional.score).toBeGreaterThanOrEqual(absolute.score);
    expect(dynamicId.warnings).toContain('The id looks auto-generated.');
    expect(absolute.rating).toBe('fragile');
  });

  it('reports stability separately from uniqueness', () => {
    const fragileButUnique = scoreCandidate(candidate({ basis: 'class', traits: { attributeStability: 0.5, usesClasses: true } }));
    expect(fragileButUnique.stabilityLevel).toBe('low');
    const stableButAmbiguous = scoreCandidate(candidate({ basis: 'testid', traits: { attributeStability: 0.95 }, validation: multiple(2) }));
    expect(stableButAmbiguous.stabilityLevel).toBe('high');
    expect(stableButAmbiguous.rating).toBe('fragile');
  });
});

describe('rankCandidates', () => {
  it('lets a stable test id outrank a role with a dynamic-looking name', () => {
    const ranked = rankCandidates([
      candidate({ kind: 'role', basis: 'role', value: 'button', options: { name: 'Order #48213' }, traits: { attributeStability: 0.35, textBased: true } }),
      candidate({ kind: 'testid', basis: 'testid', value: 'place-order', traits: { attributeStability: 0.95 } }),
    ]);
    expect(ranked[0].kind).toBe('testid');
    expect(ranked[0].rating).toBe('recommended');
  });

  it('prefers a semantic role over a stable id by default', () => {
    const ranked = rankCandidates([
      candidate({}),
      candidate({ kind: 'role', basis: 'role', value: 'button', options: { name: 'Log in' }, traits: { attributeStability: 0.85, nameSource: 'content' } }),
    ]);
    expect(ranked[0].kind).toBe('role');
  });

  it('lets a clearly stable id outrank a role whose name is long and numeric', () => {
    const ranked = rankCandidates([
      candidate({ kind: 'role', basis: 'role', value: 'link', options: { name: 'View all 2,341 results for summer dresses 2024' }, traits: { attributeStability: 0.25, textBased: true } }),
      candidate({ traits: { attributeStability: 0.9 } }),
    ]);
    expect(ranked[0].basis).toBe('id');
  });

  it('sorts unique matches before ambiguous ones and recommends only one', () => {
    const ranked = rankCandidates([
      candidate({ kind: 'testid', basis: 'testid', validation: multiple(2) }),
      candidate({ basis: 'class', traits: { attributeStability: 0.6 } }),
      candidate({ basis: 'name', traits: { attributeStability: 0.85 } }),
    ]);
    expect(ranked.map((c) => c.basis)).toEqual(['name', 'class', 'testid']);
    expect(ranked.filter((c) => c.rating === 'recommended')).toHaveLength(1);
  });

  it('does not recommend anything when every candidate is weak', () => {
    const ranked = rankCandidates([
      candidate({ kind: 'xpath', basis: 'absolute', traits: { attributeStability: 0.05, absolute: true, positional: true } }),
    ]);
    expect(ranked[0].rating).toBe('fragile');
  });
});

describe('estimateStability', () => {
  it('reduces stability for depth and dynamic classes', () => {
    expect(estimateStability({ traits: { attributeStability: 0.8, depth: 2 } })).toBeLessThan(0.8);
    expect(estimateStability({ traits: { attributeStability: 0.8, dynamicClass: true } })).toBeLessThanOrEqual(0.2);
  });
});
