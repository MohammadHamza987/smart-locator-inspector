import { beforeEach, describe, expect, it } from 'vitest';
import { OVERLAY_HOST_TAG } from '../../src/shared/constants.js';
import { createQueryContext, matchesText, resolveDescriptor, validateDescriptor, validateSelector } from '../../src/engine/validator.js';
import { ACCESSIBILITY_PAGE, DUPLICATE_BUTTONS_PAGE, DUPLICATE_IDS_PAGE, LOGIN_PAGE } from '../fixtures/pages.js';

const $ = (selector) => document.querySelector(selector);
const validate = (descriptor, target) => validateDescriptor(descriptor, target, createQueryContext(document));

describe('match-count validation', () => {
  beforeEach(() => {
    document.body.innerHTML = DUPLICATE_BUTTONS_PAGE;
  });

  it('counts CSS matches and verifies the target', () => {
    const second = document.querySelectorAll('button')[1];
    const result = validateSelector('css', 'button.danger', second, document);
    expect(result).toMatchObject({ status: 'verified', matchCount: 3, isUnique: false, matchesTarget: false, targetIndex: 1 });
  });

  it('counts XPath matches', () => {
    const second = document.querySelectorAll('button')[1];
    const result = validateSelector('xpath', "//button[normalize-space(.)='Delete']", second, document);
    expect(result.matchCount).toBe(3);
    expect(result.matchesTarget).toBe(false);
  });

  it('confirms a unique match is the selected element', () => {
    const second = document.querySelectorAll('button')[1];
    const result = validateSelector('xpath', "//tr[.//*[normalize-space(.)='Bob Smith']]//button", second, document);
    expect(result).toMatchObject({ matchCount: 1, isUnique: true, matchesTarget: true });
  });

  it('flags a unique selector that matches a different element', () => {
    const first = document.querySelectorAll('button')[0];
    const result = validateSelector('xpath', "//tr[.//*[normalize-space(.)='Bob Smith']]//button", first, document);
    expect(result).toMatchObject({ matchCount: 1, isUnique: true, matchesTarget: false, targetIncluded: false });
  });
});

describe('malformed and unsupported selectors', () => {
  beforeEach(() => {
    document.body.innerHTML = LOGIN_PAGE;
  });

  it('reports invalid CSS as an error instead of throwing', () => {
    const result = validateSelector('css', 'button[[', $('#login'), document);
    expect(result.status).toBe('error');
    expect(result.error).toMatch(/Invalid CSS selector/);
    expect(result.matchesTarget).toBe(false);
  });

  it('reports invalid XPath as an error', () => {
    const result = validateSelector('xpath', '//button[@id=', $('#login'), document);
    expect(result.status).toBe('error');
    expect(result.error).toMatch(/Invalid XPath/);
  });

  it('rejects compound class names for By.className', () => {
    const result = validate({ kind: 'className', value: 'btn btn-primary' }, $('#login'));
    expect(result.status).toBe('error');
  });

  it('rejects unknown locator kinds', () => {
    const result = validate({ kind: 'magic', value: 'x' }, $('#login'));
    expect(result.status).toBe('error');
  });
});

describe('duplicate ids', () => {
  it('reports both elements sharing an id', () => {
    document.body.innerHTML = DUPLICATE_IDS_PAGE;
    const second = $('button.secondary');
    expect(validate({ kind: 'id', value: 'save' }, second)).toMatchObject({ matchCount: 2, matchesTarget: false });
    expect(validate({ kind: 'css', value: '#save' }, second)).toMatchObject({ matchCount: 2, matchesTarget: false });
  });
});

describe('Playwright semantics emulation', () => {
  beforeEach(() => {
    document.body.innerHTML = `${LOGIN_PAGE}${ACCESSIBILITY_PAGE}`;
  });

  it('matches role names as case-insensitive substrings by default', () => {
    const matches = resolveDescriptor({ kind: 'role', value: 'button', options: { name: 'log' } }, createQueryContext(document));
    expect(matches).toContain($('#login'));
  });

  it('matches exact names case-sensitively when exact is set', () => {
    const ctx = createQueryContext(document);
    expect(resolveDescriptor({ kind: 'role', value: 'button', options: { name: 'log in', exact: true } }, ctx)).toHaveLength(0);
    expect(resolveDescriptor({ kind: 'role', value: 'button', options: { name: 'Log in', exact: true } }, ctx)).toEqual([$('#login')]);
  });

  it('excludes hidden elements from role queries', () => {
    const ctx = createQueryContext(document);
    expect(resolveDescriptor({ kind: 'role', value: 'button', options: { name: 'Hidden button' } }, ctx)).toHaveLength(0);
    expect(resolveDescriptor({ kind: 'role', value: 'button', options: { name: 'Invisible' } }, ctx)).toHaveLength(0);
  });

  it('returns the deepest element for getByText', () => {
    const matches = resolveDescriptor({ kind: 'text', value: 'Confirm' }, createQueryContext(document));
    expect(matches).toHaveLength(1);
    expect(matches[0].localName).toBe('span');
  });

  it('matches getByLabel through label[for], wrapping labels and aria-labelledby', () => {
    const ctx = createQueryContext(document);
    expect(resolveDescriptor({ kind: 'label', value: 'Email' }, ctx)).toEqual([$('#email')]);
    expect(resolveDescriptor({ kind: 'label', value: 'Remember me' }, ctx)).toEqual([$('input[type=checkbox]')]);
    expect(resolveDescriptor({ kind: 'label', value: 'Search the docs' }, ctx)).toEqual([$('input[type=search]')]);
  });

  it('matches getByTestId exactly', () => {
    document.body.innerHTML = '<b data-testid="save"></b><b data-testid="save-all"></b>';
    expect(resolveDescriptor({ kind: 'testid', value: 'save' }, createQueryContext(document))).toHaveLength(1);
  });

  it('resolves scoped chains with filters', () => {
    document.body.innerHTML = DUPLICATE_BUTTONS_PAGE;
    const descriptor = {
      kind: 'role',
      value: 'button',
      options: { name: 'Delete' },
      scope: { kind: 'role', value: 'row', options: {}, filter: { hasText: 'Carol' } },
    };
    expect(resolveDescriptor(descriptor, createQueryContext(document))).toEqual([document.querySelectorAll('button')[2]]);
  });

  it('matches Selenium link text exactly and partially', () => {
    const ctx = createQueryContext(document);
    expect(resolveDescriptor({ kind: 'linkText', value: 'Forgot your password?' }, ctx)).toEqual([$('a.link')]);
    expect(resolveDescriptor({ kind: 'linkText', value: 'Forgot' }, ctx)).toHaveLength(0);
    expect(resolveDescriptor({ kind: 'partialLinkText', value: 'Forgot' }, ctx)).toEqual([$('a.link')]);
  });
});

describe('overlay exclusion', () => {
  it('never counts the inspector overlay as a match', () => {
    document.body.innerHTML = '<button>Go</button>';
    const host = document.createElement(OVERLAY_HOST_TAG);
    host.innerHTML = '<button>Go</button>';
    document.documentElement.append(host);
    const result = validateSelector('xpath', "//button[normalize-space(.)='Go']", $('button'), document);
    expect(result.matchCount).toBe(1);
    expect(result.matchesTarget).toBe(true);
    host.remove();
  });
});

describe('matchesText', () => {
  it('normalises whitespace', () => {
    expect(matchesText('  Log \n in ', 'log in', false)).toBe(true);
    expect(matchesText('  Log \n in ', 'Log in', true)).toBe(true);
    expect(matchesText('Log in', 'Log', true)).toBe(false);
  });
});
