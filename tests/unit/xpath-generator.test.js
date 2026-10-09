import { describe, expect, it } from 'vitest';
import { absoluteXPath, generateXPathCandidates } from '../../src/engine/xpath-generator.js';
import { createQueryContext, validateDescriptor } from '../../src/engine/validator.js';
import { DUPLICATE_BUTTONS_PAGE, LOGIN_PAGE, QUOTES_PAGE } from '../fixtures/pages.js';

function xpathFor(html, selector) {
  document.body.innerHTML = html;
  const element = document.querySelector(selector);
  const ctx = createQueryContext(document);
  const candidates = generateXPathCandidates(element, ctx).map((descriptor) => ({
    ...descriptor,
    validation: validateDescriptor(descriptor, element, ctx),
  }));
  return {
    candidates,
    values: candidates.map((c) => c.value),
    unique: candidates.filter((c) => c.validation.matchesTarget).map((c) => c.value),
  };
}

describe('XPath generation', () => {
  it('produces readable relative XPath from ids, names and text', () => {
    expect(xpathFor(LOGIN_PAGE, '#login').unique).toEqual(expect.arrayContaining([
      "//button[@id='login']",
      "//button[normalize-space(.)='Log in']",
    ]));
    expect(xpathFor(LOGIN_PAGE, '#email').unique).toContain("//input[@name='email']");
  });

  it('generates label-based XPath for form fields', () => {
    expect(xpathFor(LOGIN_PAGE, '#email').unique).toContain("//input[@id=//label[normalize-space(.)='Email']/@for]");
    expect(xpathFor(LOGIN_PAGE, 'input[type=checkbox]').unique).toContain("//label[normalize-space(.)='Remember me']//input");
  });

  it('never emits absolute XPath when a relative alternative exists', () => {
    const { values } = xpathFor(LOGIN_PAGE, '#login');
    expect(values.some((value) => value.startsWith('/html'))).toBe(false);
    expect(values.every((value) => value.startsWith('//') || value.startsWith('('))).toBe(true);
  });

  it('escapes text with both quote types using concat()', () => {
    const { unique } = xpathFor(QUOTES_PAGE, 'a');
    expect(unique).toContain(`//a[normalize-space(.)=concat('It', "'", 's "complicated"')]`);
  });

  it('escapes attribute values containing a single quote', () => {
    const { unique } = xpathFor(QUOTES_PAGE, 'button[aria-label]');
    expect(unique).toContain(`//button[@aria-label="Don't stop"]`);
  });

  it('disambiguates duplicate buttons through their row instead of an index', () => {
    const { unique, candidates } = xpathFor(DUPLICATE_BUTTONS_PAGE, 'tbody tr:nth-child(2) button');
    expect(unique[0]).toBe("//tr[.//*[normalize-space(.)='Bob Smith']]//button[normalize-space(.)='Delete']");
    expect(candidates.find((c) => c.value === unique[0]).traits.positional).toBe(false);
  });

  it('falls back to an indexed expression only when needed', () => {
    const html = '<ul><li><a href="#">Edit</a></li><li><a href="#">Edit</a></li></ul>';
    const { unique, candidates } = xpathFor(html, 'li:nth-child(2) a');
    const indexed = candidates.find((c) => c.traits.positional && !c.traits.absolute);
    expect(indexed.value).toBe("(//a[normalize-space(.)='Edit'])[2]");
    expect(unique).toContain(indexed.value);
  });

  it('builds a valid absolute path as a last resort', () => {
    document.body.innerHTML = '<div><p>a</p><p><span>x</span></p></div>';
    const span = document.querySelector('span');
    const path = absoluteXPath(span);
    expect(path).toBe('/html/body/div/p[2]/span');
    const result = document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    expect(result.singleNodeValue).toBe(span);
  });
});
