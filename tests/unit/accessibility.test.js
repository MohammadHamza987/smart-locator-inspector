import { beforeEach, describe, expect, it } from 'vitest';
import {
  getAccessibleName,
  getLabelTexts,
  getRole,
  isHiddenForAccessibility,
} from '../../src/engine/accessibility.js';
import { ACCESSIBILITY_PAGE, LOGIN_PAGE } from '../fixtures/pages.js';

const $ = (selector) => document.querySelector(selector);
const nameOf = (selector) => getAccessibleName($(selector));

describe('roles', () => {
  beforeEach(() => {
    document.body.innerHTML = `${LOGIN_PAGE}${ACCESSIBILITY_PAGE}`;
  });

  it('maps native elements to implicit roles', () => {
    expect(getRole($('#login'))).toBe('button');
    expect(getRole($('#email'))).toBe('textbox');
    expect(getRole($('input[type=checkbox]'))).toBe('checkbox');
    expect(getRole($('a.link'))).toBe('link');
    expect(getRole($('select'))).toBe('combobox');
    expect(getRole($('input[type=search]'))).toBe('searchbox');
    expect(getRole($('input[type=submit]'))).toBe('button');
    expect(getRole($('h1'))).toBe('heading');
    expect(getRole($('nav'))).toBe('navigation');
  });

  it('treats img with empty alt as presentation', () => {
    expect(getRole($('img[alt=""]'))).toBe('presentation');
    expect(getRole($('img[alt="Acme logo"]'))).toBe('img');
  });

  it('honours explicit roles and ignores invalid tokens', () => {
    expect(getRole($('[role=dialog]'))).toBe('dialog');
    expect(getRole($('[role=button]'))).toBe('button');
    document.body.innerHTML = '<div role="madeup tab">x</div><a>no href</a>';
    expect(getRole($('div'))).toBe('tab');
    expect(getRole($('a'))).toBeNull();
  });
});

describe('accessible name heuristics', () => {
  beforeEach(() => {
    document.body.innerHTML = `${LOGIN_PAGE}${ACCESSIBILITY_PAGE}`;
  });

  it('uses label[for] for inputs, not their placeholder', () => {
    expect(nameOf('#email')).toEqual({ name: 'Email', source: 'label' });
  });

  it('uses a wrapping label and ignores the nested control', () => {
    expect(nameOf('input[type=checkbox]')).toEqual({ name: 'Remember me', source: 'label' });
  });

  it('does not include select options in a wrapping label name', () => {
    expect(nameOf('select')).toEqual({ name: 'Country', source: 'label' });
  });

  it('prefers aria-labelledby over content', () => {
    expect(nameOf('[role=dialog]')).toEqual({ name: 'Delete project', source: 'aria-labelledby' });
  });

  it('prefers aria-label over visible text', () => {
    expect(nameOf('button[aria-label="Close dialog"]')).toEqual({ name: 'Close dialog', source: 'aria-label' });
  });

  it('skips aria-hidden icons when computing name from content', () => {
    const confirm = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Confirm'));
    expect(getAccessibleName(confirm)).toEqual({ name: 'Confirm', source: 'content' });
  });

  it('uses value for submit inputs and alt for images', () => {
    expect(nameOf('input[type=submit]')).toEqual({ name: 'Send message', source: 'value' });
    expect(nameOf('img[alt="Acme logo"]')).toEqual({ name: 'Acme logo', source: 'alt' });
  });

  it('falls back to title, then placeholder', () => {
    expect(nameOf('input[title=Quantity]')).toEqual({ name: 'Quantity', source: 'title' });
    document.body.innerHTML = '<input placeholder="Search products">';
    expect(nameOf('input')).toEqual({ name: 'Search products', source: 'placeholder' });
  });

  it('includes nested text across inline elements', () => {
    expect(nameOf('h2').name).toBe('Pricing (monthly)');
  });

  it('does not treat innerText as the name when aria-label exists', () => {
    document.body.innerHTML = '<a href="/cart" aria-label="Cart (3 items)"><svg></svg>3</a>';
    expect(nameOf('a').name).toBe('Cart (3 items)');
  });

  it('never reads typed values of text inputs inside labels', () => {
    document.body.innerHTML = '<label>Code <input value="SECRET-123"></label><button aria-labelledby="l">x</button><span id="l">Amount <input value="999"></span>';
    expect(nameOf('button').name).not.toContain('999');
  });
});

describe('hidden elements', () => {
  beforeEach(() => {
    document.body.innerHTML = ACCESSIBILITY_PAGE;
  });

  it('detects aria-hidden and display:none', () => {
    const buttons = Array.from(document.querySelectorAll('button'));
    expect(isHiddenForAccessibility(buttons.find((b) => b.textContent === 'Hidden button'))).toBe(true);
    expect(isHiddenForAccessibility(buttons.find((b) => b.textContent === 'Invisible'))).toBe(true);
    expect(isHiddenForAccessibility(buttons.find((b) => b.textContent.includes('Confirm')))).toBe(false);
  });
});

describe('label texts for getByLabel', () => {
  it('collects <label>, aria-labelledby and aria-label', () => {
    document.body.innerHTML = ACCESSIBILITY_PAGE;
    expect(getLabelTexts($('input[type=search]')).map((entry) => entry.text)).toEqual(['Search the docs']);
    document.body.innerHTML = '<input aria-label="Zip code">';
    expect(getLabelTexts($('input'))[0]).toMatchObject({ text: 'Zip code', source: 'aria-label' });
  });
});
