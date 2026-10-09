import { describe, expect, it } from 'vitest';
import { OVERLAY_HOST_TAG } from '../../src/shared/constants.js';
import {
  getElementDetails,
  getElementKind,
  getParentElement,
  getTextPreview,
  isSensitiveField,
  resolveInspectableTarget,
  sanitizePreview,
} from '../../src/engine/dom-inspector.js';
import { ACCESSIBILITY_PAGE, LOGIN_PAGE } from '../fixtures/pages.js';

describe('target resolution', () => {
  it('promotes icons and spans to their interactive ancestor', () => {
    document.body.innerHTML = ACCESSIBILITY_PAGE;
    const path = document.querySelector('path');
    const span = Array.from(document.querySelectorAll('span')).find((s) => s.textContent === 'Confirm');
    expect(resolveInspectableTarget(path).localName).toBe('button');
    expect(resolveInspectableTarget(span).localName).toBe('button');
    expect(resolveInspectableTarget(span, { promote: false })).toBe(span);
  });

  it('ignores the overlay and non-inspectable nodes', () => {
    const host = document.createElement(OVERLAY_HOST_TAG);
    const inner = document.createElement('div');
    host.append(inner);
    document.body.append(host);
    expect(resolveInspectableTarget(host)).toBeNull();
    expect(resolveInspectableTarget(inner)).toBeNull();
    expect(resolveInspectableTarget(document.documentElement)).toBeNull();
    expect(resolveInspectableTarget(document.createTextNode('x'))).toBeNull();
  });

  it('walks up to parents but not past body', () => {
    document.body.innerHTML = '<div><p>x</p></div>';
    expect(getParentElement(document.querySelector('p')).localName).toBe('div');
    expect(getParentElement(document.body)).toBeNull();
  });
});

describe('privacy-safe details', () => {
  it('never reads form values into previews', () => {
    document.body.innerHTML = LOGIN_PAGE;
    const password = document.querySelector('#password');
    expect(getTextPreview(password)).toBe('');
    expect(isSensitiveField(password)).toBe(true);
    expect(JSON.stringify(getElementDetails(password))).not.toContain('hunter2');
  });

  it('redacts emails and long numbers in previews', () => {
    expect(sanitizePreview('Contact jane.doe@corp.com or 555 123 4567')).toBe('Contact [email] or [number]');
  });

  it('truncates long text', () => {
    document.body.innerHTML = `<p>${'word '.repeat(50)}</p>`;
    expect(getTextPreview(document.querySelector('p')).length).toBeLessThanOrEqual(60);
  });

  it('collects the documented attributes', () => {
    document.body.innerHTML = LOGIN_PAGE;
    const details = getElementDetails(document.querySelector('#email'));
    expect(details).toMatchObject({
      tag: 'input',
      id: 'email',
      name: 'email',
      type: 'email',
      role: 'textbox',
      accessibleName: 'Email',
      accessibleNameSource: 'label',
      placeholder: 'you@example.com',
      label: 'Email',
      kind: 'text-input',
    });
  });

  it('classifies element kinds for usage examples', () => {
    document.body.innerHTML = LOGIN_PAGE;
    expect(getElementKind(document.querySelector('#login'))).toBe('button');
    expect(getElementKind(document.querySelector('input[type=checkbox]'))).toBe('checkbox');
    expect(getElementKind(document.querySelector('a.link'))).toBe('link');
  });
});
