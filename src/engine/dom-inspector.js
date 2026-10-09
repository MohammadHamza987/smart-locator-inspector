import { OVERLAY_HOST_TAG, TEST_ID_ATTRIBUTES } from '../shared/constants.js';
import { getAccessibleName, getAssociatedLabelText, getRole } from './accessibility.js';
import { normalizeWhitespace, truncate } from './escape.js';
import { classifyClass } from './stability.js';

const ELEMENT_NODE = 1;

const INTERACTIVE_SELECTOR = [
  'button', 'a[href]', 'label', 'summary', 'select', 'textarea', 'input',
  '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]', '[role="tab"]', '[role="option"]', '[role="checkbox"]',
  '[role="radio"]', '[role="switch"]', '[role="treeitem"]', '[contenteditable=""]',
  '[contenteditable="true"]',
].join(', ');

/** Elements that are usually decoration inside a more meaningful control. */
const PROMOTABLE_TAGS = new Set([
  'span', 'i', 'b', 'strong', 'em', 'small', 'img', 'svg', 'path', 'use', 'g', 'circle',
  'rect', 'line', 'polyline', 'polygon', 'ellipse', 'text', 'tspan', 'mark', 'sup', 'sub',
]);

const NON_INSPECTABLE_TAGS = new Set(['html', 'head', 'script', 'style', 'meta', 'link', 'title', 'noscript', 'template']);

export function isOverlayElement(node) {
  if (!node || node.nodeType !== ELEMENT_NODE) return false;
  return Boolean(node.closest?.(OVERLAY_HOST_TAG));
}

function tagName(element) {
  return (element.localName || '').toLowerCase();
}

/**
 * Turns a raw pointer target into the element a tester most likely means.
 * An icon <svg> or <span> inside a button resolves to the button itself.
 */
export function resolveInspectableTarget(node, { promote = true } = {}) {
  let element = node;
  if (!element) return null;
  if (element.nodeType !== ELEMENT_NODE) element = element.parentElement;
  if (!element || isOverlayElement(element)) return null;
  if (NON_INSPECTABLE_TAGS.has(tagName(element))) return null;

  if (element.namespaceURI === 'http://www.w3.org/2000/svg' && tagName(element) !== 'svg') {
    element = element.closest('svg') ?? element;
  }

  if (promote && PROMOTABLE_TAGS.has(tagName(element))) {
    const interactive = element.parentElement?.closest(INTERACTIVE_SELECTOR);
    if (interactive && depthBetween(element, interactive) <= 3) {
      return interactive;
    }
  }
  return element;
}

function depthBetween(descendant, ancestor) {
  let depth = 0;
  for (let node = descendant; node && node !== ancestor; node = node.parentElement) depth++;
  return depth;
}

export function getParentElement(element) {
  const parent = element?.parentElement;
  if (!parent || tagName(parent) === 'html') return null;
  return parent;
}

export function getTestIdAttribute(element) {
  for (const name of TEST_ID_ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (value && value.trim()) return { name, value };
  }
  return null;
}

export function isSensitiveField(element) {
  const tag = tagName(element);
  if (tag !== 'input' && tag !== 'textarea') return false;
  const type = (element.getAttribute('type') || '').toLowerCase();
  if (type === 'password') return true;
  const autocomplete = (element.getAttribute('autocomplete') || '').toLowerCase();
  return /cc-|current-password|new-password|one-time-code/.test(autocomplete);
}

/** Classifies an element to suggest a sensible usage example. */
export function getElementKind(element) {
  const tag = tagName(element);
  const role = element.getAttribute('role');
  if (tag === 'input') {
    const type = (element.getAttribute('type') || 'text').toLowerCase();
    if (type === 'checkbox' || role === 'switch') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'file') return 'file';
    if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button';
    if (['range', 'color', 'hidden'].includes(type)) return 'other';
    return 'text-input';
  }
  if (tag === 'textarea') return 'text-input';
  if (tag === 'select') return 'select';
  if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') return 'text-input';
  if (role === 'checkbox' || role === 'switch') return 'checkbox';
  if (role === 'radio') return 'radio';
  if (role === 'textbox' || role === 'searchbox') return 'text-input';
  if (tag === 'a') return 'link';
  if (tag === 'button' || role === 'button') return 'button';
  return 'other';
}

function isTextEntry(element) {
  const tag = tagName(element);
  return tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable ||
    element.getAttribute('contenteditable') === 'true';
}

/** Removes things that look like personal data from preview text. */
export function sanitizePreview(text) {
  return normalizeWhitespace(text)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\d[\d\s-]{6,}\d/g, '[number]');
}

/**
 * Short text preview for display only. Form controls and editable regions
 * never contribute text, so typed values are never collected.
 */
export function getTextPreview(element, max = 60) {
  if (isTextEntry(element)) return '';
  const text = sanitizePreview(visibleTextContent(element));
  return truncate(text, max);
}

export function visibleTextContent(element) {
  let text = '';
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) text += child.textContent;
      else if (child.nodeType === ELEMENT_NODE) {
        const tag = tagName(child);
        if (NON_INSPECTABLE_TAGS.has(tag) || tag === 'textarea' || tag === 'select') continue;
        text += ' ';
        walk(child);
        text += ' ';
      }
    }
  };
  walk(element);
  return normalizeWhitespace(text);
}

export function describeElementShort(element) {
  if (!element) return '';
  let result = tagName(element);
  if (element.id) result += `#${element.id}`;
  const classes = relevantClasses(element).slice(0, 2);
  if (classes.length) result += '.' + classes.join('.');
  return truncate(result, 70);
}

export function relevantClasses(element) {
  return Array.from(element.classList || [])
    .filter((name) => classifyClass(name) !== 'dynamic')
    .slice(0, 6);
}

function attr(element, name) {
  const value = element.getAttribute(name);
  return value && value.trim() ? truncate(normalizeWhitespace(value), 80) : null;
}

/** Structured, privacy-safe element summary for display in the UI. */
export function getElementDetails(element, cache) {
  const tag = tagName(element);
  const role = getRole(element, cache);
  const { name: accessibleName, source: accessibleNameSource } = getAccessibleName(element, cache);
  const testId = getTestIdAttribute(element);
  const type = tag === 'input' ? (element.getAttribute('type') || 'text').toLowerCase() : attr(element, 'type');
  const sensitive = isSensitiveField(element);
  const href = tag === 'a' ? attr(element, 'href') : null;

  return {
    tag,
    summary: describeElementShort(element),
    id: attr(element, 'id'),
    classes: relevantClasses(element),
    name: attr(element, 'name'),
    type,
    role,
    explicitRole: Boolean(element.getAttribute('role')),
    accessibleName: truncate(sensitive ? accessibleName : sanitizeName(accessibleName), 80),
    accessibleNameSource,
    placeholder: attr(element, 'placeholder'),
    ariaLabel: attr(element, 'aria-label'),
    label: truncate(getAssociatedLabelText(element), 80) || null,
    title: attr(element, 'title'),
    alt: attr(element, 'alt'),
    href: href && !/^javascript:/i.test(href) ? href : null,
    testId: testId ? { name: testId.name, value: truncate(testId.value, 80) } : null,
    textPreview: getTextPreview(element),
    kind: getElementKind(element),
    sensitive,
    inShadowDom: element.getRootNode?.() !== element.ownerDocument,
    inIframe: element.ownerDocument.defaultView !== element.ownerDocument.defaultView?.top,
  };
}

function sanitizeName(name) {
  return name ? name.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]') : name;
}
