import { describe, expect, it } from 'vitest';
import { playwrightExample, playwrightLocator, supportsPlaywright } from '../../src/generators/playwright-generator.js';
import {
  javaVariableName,
  seleniumBy,
  seleniumExample,
  seleniumFindElement,
  supportsSelenium,
} from '../../src/generators/selenium-java-generator.js';

describe('Playwright JavaScript generation', () => {
  it.each([
    [{ kind: 'role', value: 'button', options: { name: 'Login' } }, "page.getByRole('button', { name: 'Login' })"],
    [{ kind: 'role', value: 'button', options: { name: 'Log', exact: true } }, "page.getByRole('button', { name: 'Log', exact: true })"],
    [{ kind: 'role', value: 'navigation', options: {} }, "page.getByRole('navigation')"],
    [{ kind: 'label', value: 'Email', options: {} }, "page.getByLabel('Email')"],
    [{ kind: 'label', value: 'Email', options: { exact: true } }, "page.getByLabel('Email', { exact: true })"],
    [{ kind: 'placeholder', value: 'you@example.com' }, "page.getByPlaceholder('you@example.com')"],
    [{ kind: 'testid', value: 'login-button' }, "page.getByTestId('login-button')"],
    [{ kind: 'text', value: 'Welcome back' }, "page.getByText('Welcome back')"],
    [{ kind: 'altText', value: 'Acme logo' }, "page.getByAltText('Acme logo')"],
    [{ kind: 'title', value: 'Close' }, "page.getByTitle('Close')"],
    [{ kind: 'css', value: '#login' }, "page.locator('#login')"],
    [{ kind: 'xpath', value: "//button[@id='login']" }, `page.locator("xpath=//button[@id='login']")`],
  ])('renders %o', (descriptor, expected) => {
    expect(playwrightLocator(descriptor)).toBe(expected);
  });

  it('escapes quotes in names and selectors', () => {
    expect(playwrightLocator({ kind: 'role', value: 'button', options: { name: "Don't stop" } })).toBe(`page.getByRole('button', { name: "Don't stop" })`);
    expect(playwrightLocator({ kind: 'xpath', value: `//a[normalize-space(.)=concat('It', "'", 's')]` }))
      .toBe(`page.locator('xpath=//a[normalize-space(.)=concat(\\'It\\', "\\'", \\'s\\')]')`);
    expect(playwrightLocator({ kind: 'css', value: 'button[title="Say \\"hi\\""]' })).toBe(`page.locator('button[title="Say \\\\"hi\\\\""]')`);
  });

  it('renders scoped chains and filters', () => {
    const descriptor = {
      kind: 'role',
      value: 'button',
      options: { name: 'Delete' },
      scope: { kind: 'role', value: 'row', options: {}, filter: { hasText: 'Bob Smith' } },
    };
    expect(playwrightLocator(descriptor)).toBe("page.getByRole('row').filter({ hasText: 'Bob Smith' }).getByRole('button', { name: 'Delete' })");
  });

  it('keeps actions out of the locator and in a separate example', () => {
    const descriptor = { kind: 'label', value: 'Email' };
    expect(playwrightLocator(descriptor)).not.toMatch(/fill|click/);
    expect(playwrightExample(descriptor, { kind: 'text-input' })).toBe("await page.getByLabel('Email').fill('text');");
    expect(playwrightExample({ kind: 'role', value: 'checkbox', options: { name: 'Remember me' } }, { kind: 'checkbox' }))
      .toBe("await page.getByRole('checkbox', { name: 'Remember me' }).check();");
    expect(playwrightExample({ kind: 'css', value: '#go' }, { kind: 'button' })).toBe("await page.locator('#go').click();");
    expect(playwrightExample({ kind: 'css', value: 'select' }, { kind: 'select' })).toContain('selectOption(');
  });

  it('does not support Selenium-only strategies', () => {
    expect(supportsPlaywright({ kind: 'linkText', value: 'x' })).toBe(false);
    expect(() => playwrightLocator({ kind: 'id', value: 'x' })).toThrow();
  });
});

describe('Selenium Java generation', () => {
  it.each([
    [{ kind: 'id', value: 'login' }, 'By.id("login")'],
    [{ kind: 'name', value: 'email' }, 'By.name("email")'],
    [{ kind: 'css', value: '#login' }, 'By.cssSelector("#login")'],
    [{ kind: 'xpath', value: "//button[@id='login']" }, `By.xpath("//button[@id='login']")`],
    [{ kind: 'className', value: 'btn-primary' }, 'By.className("btn-primary")'],
    [{ kind: 'linkText', value: 'Forgot password?' }, 'By.linkText("Forgot password?")'],
    [{ kind: 'partialLinkText', value: 'Forgot' }, 'By.partialLinkText("Forgot")'],
  ])('renders %o', (descriptor, expected) => {
    expect(seleniumBy(descriptor)).toBe(expected);
  });

  it('wraps By in driver.findElement', () => {
    expect(seleniumFindElement({ kind: 'id', value: 'login' })).toBe('driver.findElement(By.id("login"))');
  });

  it('escapes Java string literals', () => {
    expect(seleniumBy({ kind: 'css', value: 'button[title="Say \\"hi\\""]' })).toBe('By.cssSelector("button[title=\\"Say \\\\\\"hi\\\\\\"\\"]")');
    expect(seleniumBy({ kind: 'xpath', value: `//a[.="x"]` })).toBe('By.xpath("//a[.=\\"x\\"]")');
  });

  it('refuses Playwright-only and compound strategies', () => {
    expect(supportsSelenium({ kind: 'role', value: 'button' })).toBe(false);
    expect(supportsSelenium({ kind: 'css', value: 'x', scope: { kind: 'testid', value: 'y' } })).toBe(false);
    expect(() => seleniumBy({ kind: 'role', value: 'button' })).toThrow(/no direct equivalent/);
    expect(() => seleniumBy({ kind: 'className', value: 'a b' })).toThrow(/compound/);
  });

  it('builds complete examples with WebElement and the right action', () => {
    const example = seleniumExample({ kind: 'id', value: 'login' }, { kind: 'button', id: 'login' });
    expect(example).toContain('import org.openqa.selenium.By;');
    expect(example).toContain('import org.openqa.selenium.WebElement;');
    expect(example).toContain('WebElement loginButton = driver.findElement(By.id("login"));');
    expect(example).toContain('loginButton.click();');

    const input = seleniumExample({ kind: 'name', value: 'email' }, { kind: 'text-input', name: 'email' });
    expect(input).toContain('emailInput.clear();');
    expect(input).toContain('emailInput.sendKeys("text");');

    const select = seleniumExample({ kind: 'name', value: 'country' }, { kind: 'select', name: 'country' });
    expect(select).toContain('import org.openqa.selenium.support.ui.Select;');
    expect(select).toContain('new Select(countrySelect).selectByVisibleText("Option");');
  });

  it('creates valid Java identifiers', () => {
    expect(javaVariableName({ kind: 'button', accessibleName: 'Log in' })).toBe('logInButton');
    expect(javaVariableName({ kind: 'button', id: 'submit-button' })).toBe('submitButton');
    expect(javaVariableName({ kind: 'link', id: '1st-item' })).toMatch(/^[a-zA-Z_$][\w$]*$/);
    expect(javaVariableName({ kind: 'other' })).toBe('element');
    expect(javaVariableName({ kind: 'other', name: 'class' })).toBe('classElement');
  });
});
