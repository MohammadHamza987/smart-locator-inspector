import { describe, expect, it } from 'vitest';
import { analyzeElement } from '../../src/engine/index.js';
import {
  ACCESSIBILITY_PAGE,
  DUPLICATE_BUTTONS_PAGE,
  DUPLICATE_IDS_PAGE,
  DYNAMIC_PAGE,
  LOGIN_PAGE,
  QUOTES_PAGE,
  TEST_ID_PAGE,
} from '../fixtures/pages.js';

function analyze(html, selector) {
  document.body.innerHTML = html;
  const element = document.querySelector(selector);
  const { result, descriptorsByKey } = analyzeElement(element);
  return { element, result, descriptorsByKey, pw: result.frameworks.playwright, se: result.frameworks.selenium };
}

describe('analyzeElement on realistic pages', () => {
  it('recommends getByRole for a login button and By.id for Selenium', () => {
    const { pw, se } = analyze(LOGIN_PAGE, '#login');
    expect(pw[0]).toMatchObject({ rating: 'recommended', code: "page.getByRole('button', { name: 'Log in' })" });
    expect(se[0]).toMatchObject({ rating: 'recommended', code: 'driver.findElement(By.id("login"))' });
    expect(pw[0].validation).toMatchObject({ matchCount: 1, matchesTarget: true });
  });

  it('recommends only candidates verified unique against the selected element', () => {
    for (const [html, selector] of [[LOGIN_PAGE, '#email'], [DUPLICATE_BUTTONS_PAGE, 'tbody tr:nth-child(3) button'], [TEST_ID_PAGE, '[data-testid="cart-item-apple"] button']]) {
      const { pw, se } = analyze(html, selector);
      for (const list of [pw, se]) {
        const recommended = list.filter((c) => c.rating === 'recommended');
        expect(recommended.length).toBeLessThanOrEqual(1);
        for (const candidate of recommended) expect(candidate.validation.matchesTarget).toBe(true);
      }
    }
  });

  it('disambiguates duplicate buttons with a row filter', () => {
    const { pw, se } = analyze(DUPLICATE_BUTTONS_PAGE, 'tbody tr:nth-child(2) button');
    expect(pw[0].code).toBe("page.getByRole('row').filter({ hasText: 'Bob Smith' }).getByRole('button', { name: 'Delete' })");
    expect(se[0].code).toContain("//tr[.//*[normalize-space(.)='Bob Smith']]//button");
    const ambiguous = pw.find((c) => c.code === "page.getByRole('button', { name: 'Delete' })");
    expect(ambiguous).toMatchObject({ rating: 'fragile' });
    expect(ambiguous.validation.matchCount).toBe(3);
  });

  it('does not recommend a duplicated id', () => {
    const { pw, se } = analyze(DUPLICATE_IDS_PAGE, 'button.secondary');
    expect(pw[0].code).toBe("page.getByRole('button', { name: 'Save and publish' })");
    const byId = se.find((c) => c.code === 'driver.findElement(By.id("save"))');
    expect(byId.rating).toBe('fragile');
    expect(se[0].rating).not.toBe('fragile');
  });

  it('chains test ids when a test id repeats', () => {
    const { pw } = analyze(TEST_ID_PAGE, '[data-testid="cart-item-pear"] button');
    expect(pw.map((c) => c.code)).toContain("page.getByTestId('cart-item-pear').getByTestId('remove')");
    expect(pw.find((c) => c.code === "page.getByTestId('remove')").rating).toBe('fragile');
  });

  it('prefers semantics over generated ids and hashed classes', () => {
    const { pw, se } = analyze(DYNAMIC_PAGE, 'button');
    expect(pw[0].code).toBe("page.getByRole('button', { name: 'Continue' })");
    const byId = se.find((c) => c.kind === 'id');
    expect(byId.stabilityLevel).toBe('low');
    expect(se[0].kind).not.toBe('id');
  });

  it('uses getByLabel and the label XPath for form fields', () => {
    const { pw, se } = analyze(LOGIN_PAGE, '#email');
    expect(pw.map((c) => c.code)).toContain("page.getByLabel('Email')");
    expect(se.map((c) => c.code)).toContain(`driver.findElement(By.xpath("//input[@id=//label[normalize-space(.)='Email']/@for]"))`);
  });

  it('explains Selenium conversions of Playwright-only locators', () => {
    const { pw, se } = analyze(DUPLICATE_IDS_PAGE, 'button.secondary');
    const converted = se.find((c) => c.convertedFrom);
    expect(converted.convertedFrom).toBe("page.getByRole('button', { name: 'Save and publish' })");
    expect(pw[0].seleniumAlternative).toBe(converted.code);
  });

  it('generates locators for elements without ids or test attributes', () => {
    const { pw, se } = analyze('<main><section><h3>Plans</h3><p>Choose a plan</p><button>Upgrade</button></section></main>', 'button');
    expect(pw[0].code).toBe("page.getByRole('button', { name: 'Upgrade' })");
    expect(se[0].code).toBe(`driver.findElement(By.xpath("//button[normalize-space(.)='Upgrade']"))`);
  });

  it('handles quotes and special characters end to end', () => {
    const { pw, se } = analyze(QUOTES_PAGE, 'a');
    expect(pw[0].code).toBe(`page.getByRole('link', { name: 'It\\'s "complicated"' })`);
    expect(se.map((c) => c.code)).toContain('driver.findElement(By.linkText("It\'s \\"complicated\\""))');
  });

  it('never leaks password or typed values into the result', () => {
    document.body.innerHTML = LOGIN_PAGE;
    document.querySelector('#email').value = 'typed.user@example.com';
    const { result } = analyzeElement(document.querySelector('#password'));
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('typed.user');
    expect(result.details.sensitive).toBe(true);
    expect(result.frameworks.playwright[0].example).toContain("fill('secret')");
  });

  it('keeps descriptors for every rendered candidate so they can be highlighted', () => {
    const { result, descriptorsByKey } = analyze(ACCESSIBILITY_PAGE, 'input[type=submit]');
    for (const candidate of [...result.frameworks.playwright, ...result.frameworks.selenium]) {
      expect(descriptorsByKey.has(candidate.key)).toBe(true);
    }
    expect(result.frameworks.playwright[0].code).toBe("page.getByRole('button', { name: 'Send message' })");
  });

  it('produces JSON-serialisable output without DOM references', () => {
    const { result } = analyze(LOGIN_PAGE, '#login');
    expect(() => structuredClone(result)).not.toThrow();
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
