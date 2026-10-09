import { describe, expect, it } from 'vitest';
import { classifyClass, idStability, isDynamicId, textStability } from '../../src/engine/stability.js';

describe('id stability', () => {
  it.each([
    'login', 'email', 'submit-button', 'main-nav', 'checkout_form',
  ])('treats "%s" as stable', (id) => {
    expect(isDynamicId(id)).toBe(false);
  });

  it.each([
    'ember1234', ':r5:', 'react-select-3-input', '12345', 'a3f9c2e1-7b4d-4c8e-9f1a-2b3c4d5e6f70',
    'mui-42', 'headlessui-menu-button-7', 'ext-gen1234', 'item-839201', 'x7Yk2Pq9',
  ])('treats "%s" as dynamic', (id) => {
    expect(isDynamicId(id)).toBe(true);
  });

  it('rates trailing small numbers as medium', () => {
    expect(idStability('step2')).toBeGreaterThanOrEqual(0.5);
    expect(idStability('step2')).toBeLessThan(0.9);
  });
});

describe('class classification', () => {
  it.each([
    ['btn-primary', 'semantic'],
    ['login-form', 'semantic'],
    ['css-1x2y3z4', 'dynamic'],
    ['sc-AxjAm', 'dynamic'],
    ['jsx-2391', 'dynamic'],
    ['Button_root__a1B2c', 'dynamic'],
    ['_3xYzQ', 'dynamic'],
    ['active', 'state'],
    ['is-open', 'state'],
    ['ng-touched', 'state'],
    ['menu--expanded', 'state'],
    ['mt-4', 'utility'],
    ['hover:bg-blue-500', 'utility'],
    ['flex', 'utility'],
  ])('classifies %s as %s', (name, expected) => {
    expect(classifyClass(name)).toBe(expected);
  });
});

describe('text stability', () => {
  it('prefers short, number-free text', () => {
    expect(textStability('Log in')).toBeGreaterThan(textStability('3 items in cart'));
    expect(textStability('Log in')).toBeGreaterThan(textStability('Total: $19.99'));
    expect(textStability('Submit')).toBeGreaterThan(textStability('A very long sentence that keeps going and going for a while'));
  });
});
