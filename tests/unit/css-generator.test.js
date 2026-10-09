import { describe, expect, it } from 'vitest';
import { attributeSelectors, generateCssCandidates } from '../../src/engine/css-generator.js';
import { createQueryContext, validateDescriptor } from '../../src/engine/validator.js';
import { DUPLICATE_BUTTONS_PAGE, DUPLICATE_IDS_PAGE, DYNAMIC_PAGE, LOGIN_PAGE, QUOTES_PAGE, TEST_ID_PAGE } from '../fixtures/pages.js';

function cssFor(html, selector) {
  document.body.innerHTML = html;
  const element = document.querySelector(selector);
  const ctx = createQueryContext(document);
  const candidates = generateCssCandidates(element, ctx).map((descriptor) => ({
    ...descriptor,
    validation: validateDescriptor(descriptor, element, ctx),
  }));
  return { element, candidates, values: candidates.map((c) => c.value), unique: candidates.filter((c) => c.validation.matchesTarget).map((c) => c.value) };
}

describe('CSS selector generation', () => {
  it('prefers a stable id', () => {
    const { values } = cssFor(LOGIN_PAGE, '#login');
    expect(values[0]).toBe('#login');
  });

  it('puts test attributes first', () => {
    const { values } = cssFor(TEST_ID_PAGE, '[data-testid="checkout-button"]');
    expect(values[0]).toBe('[data-testid="checkout-button"]');
  });

  it('generates name-based selectors for form fields', () => {
    const { unique } = cssFor(LOGIN_PAGE, '#email');
    expect(unique).toContain('input[name="email"]');
    expect(unique).toContain('input[placeholder="you@example.com"]');
  });

  it('escapes special characters in identifiers and attribute values', () => {
    const { unique } = cssFor(QUOTES_PAGE, '[id="1st-item"]');
    expect(unique).toContain('[id="1st-item"]');
    const named = cssFor(QUOTES_PAGE, 'input');
    expect(named.unique).toContain('input[name="weird[name].field"]');
    const titled = cssFor(QUOTES_PAGE, 'button[title]');
    expect(titled.unique).toContain('button[title="Say \\"hello\\""]');
  });

  it('never uses dynamic-looking classes', () => {
    const { values } = cssFor(DYNAMIC_PAGE, 'button');
    expect(values.join(' ')).not.toMatch(/sc-bdVaJa|css-a8f3k2|jsx-2391/);
  });

  it('marks generated ids as low stability', () => {
    const { candidates } = cssFor(DYNAMIC_PAGE, 'button');
    const idCandidate = candidates.find((c) => c.basis === 'id');
    expect(idCandidate.value).toBe('#\\:r5\\:');
    expect(idCandidate.traits.attributeStability).toBeLessThan(0.5);
  });

  it('reports duplicate ids as non-unique', () => {
    const { candidates } = cssFor(DUPLICATE_IDS_PAGE, 'button.secondary');
    const idCandidate = candidates.find((c) => c.value === '#save');
    expect(idCandidate.validation.matchCount).toBe(2);
    expect(idCandidate.validation.matchesTarget).toBe(false);
  });

  it('falls back to a short structural path when nothing else is unique', () => {
    const { candidates } = cssFor(DUPLICATE_BUTTONS_PAGE, 'tbody tr:nth-child(2) button');
    const structural = candidates.find((c) => c.basis === 'structure');
    expect(structural.validation.matchesTarget).toBe(true);
    expect(structural.traits.positional).toBe(true);
    expect(structural.value.split('>').length).toBeLessThanOrEqual(7);
  });

  it('handles elements without ids', () => {
    const { unique } = cssFor('<div><span class="price-tag">$5</span><span>other</span></div>', '.price-tag');
    expect(unique).toContain('span.price-tag');
  });

  it('does not use the value attribute of text inputs', () => {
    document.body.innerHTML = '<input name="q" value="private search">';
    const selectors = attributeSelectors(document.querySelector('input')).map((entry) => entry.selector);
    expect(selectors.join(' ')).not.toContain('private search');
  });
});
