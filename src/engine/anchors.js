import { getRole } from './accessibility.js';
import { getTestIdAttribute } from './dom-inspector.js';
import { cssAttr, cssEscape, idSelector, normalizeWhitespace, xpathLiteral } from './escape.js';
import { attributeValueStability, idStability, stableClasses } from './stability.js';
import { queryCss } from './validator.js';

const MAX_ANCHOR_DISTANCE = 8;
const LANDMARK_TAGS = new Set(['nav', 'header', 'footer', 'main', 'aside', 'form', 'dialog', 'table']);
const CONTAINER_ROLES = new Set(['row', 'listitem', 'article', 'group', 'region', 'dialog', 'tabpanel', 'form', 'gridcell', 'cell']);

export function isUniqueCss(selector, target, ctx) {
  try {
    const matches = queryCss(selector, ctx.doc);
    return matches.length === 1 && matches[0] === target;
  } catch {
    return false;
  }
}

export function xpathTag(element) {
  const tag = element.localName;
  if (element.namespaceURI && element.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
    return `*[local-name()=${xpathLiteral(tag)}]`;
  }
  return tag;
}

export function xpathHasClass(className) {
  return `contains(concat(' ', normalize-space(@class), ' '), ${xpathLiteral(` ${className} `)})`;
}

/** XPath string-value normalisation (normalize-space only collapses ASCII whitespace). */
export function xpathNormalize(text) {
  return String(text ?? '').replace(/[ \t\r\n]+/g, ' ').trim();
}

function anchorFor(node, ctx) {
  const tag = cssEscape(node.localName);
  const testId = getTestIdAttribute(node);
  if (testId) {
    const css = cssAttr(testId.name, testId.value);
    if (isUniqueCss(css, node, ctx)) {
      return {
        basis: 'testid',
        css,
        xpath: `//*[@${testId.name}=${xpathLiteral(testId.value)}]`,
        testIdAttribute: testId.name,
        testIdValue: testId.value,
        stability: Math.max(0.8, attributeValueStability(testId.value)),
      };
    }
  }
  if (node.id && idStability(node.id) >= 0.5) {
    const css = idSelector(node.id);
    if (isUniqueCss(css, node, ctx)) {
      return { basis: 'id', css, xpath: `//${xpathTag(node)}[@id=${xpathLiteral(node.id)}]`, stability: idStability(node.id) };
    }
  }
  for (const attribute of ['name', 'aria-label']) {
    const value = node.getAttribute(attribute);
    if (value && ['form', 'section', 'nav', 'fieldset', 'dialog', 'table'].includes(node.localName)) {
      const css = `${tag}${cssAttr(attribute, value)}`;
      if (isUniqueCss(css, node, ctx)) {
        return {
          basis: 'attribute',
          css,
          xpath: `//${xpathTag(node)}[@${attribute}=${xpathLiteral(value)}]`,
          stability: attributeValueStability(value),
        };
      }
    }
  }
  if (LANDMARK_TAGS.has(node.localName) && isUniqueCss(tag, node, ctx)) {
    return { basis: 'structure', css: tag, xpath: `//${xpathTag(node)}`, stability: 0.6 };
  }
  for (const className of stableClasses(node).slice(0, 4)) {
    const css = `${tag}.${cssEscape(className)}`;
    if (isUniqueCss(css, node, ctx)) {
      return { basis: 'class', css, xpath: `//${xpathTag(node)}[${xpathHasClass(className)}]`, stability: 0.5 };
    }
  }
  return null;
}

/** Nearest uniquely identifiable ancestors, closest first. */
export function findAnchors(element, ctx, max = 3) {
  const anchors = [];
  let node = element.parentElement;
  let distance = 1;
  while (node && node.localName !== 'html' && node.localName !== 'body' && distance <= MAX_ANCHOR_DISTANCE && anchors.length < max) {
    const anchor = anchorFor(node, ctx);
    if (anchor) anchors.push({ element: node, distance, ...anchor });
    node = node.parentElement;
    distance++;
  }
  return anchors;
}

function leafTexts(container, exclude) {
  const texts = [];
  const seen = new Set();
  for (const element of container.querySelectorAll('*')) {
    if (exclude.contains(element) || element.contains(exclude)) continue;
    if (element.children.length > 0) continue;
    if (['script', 'style', 'template', 'svg', 'input', 'select', 'textarea', 'option'].includes(element.localName)) continue;
    const text = xpathNormalize(element.textContent);
    if (text.length < 2 || text.length > 40 || seen.has(text) || text !== normalizeWhitespace(text)) continue;
    seen.add(text);
    texts.push(text);
    if (texts.length >= 20) break;
  }
  return texts;
}

function peerSelectorFor(container) {
  const tag = cssEscape(container.localName);
  const role = container.getAttribute('role');
  if (role) return `${tag}${cssAttr('role', role)}`;
  const className = stableClasses(container)[0];
  return className ? `${tag}.${cssEscape(className)}` : tag;
}

/**
 * Finds a repeated container (table row, list item, card) around the element
 * plus a short text that only this container contains. Used to disambiguate
 * identical controls such as a "Delete" button in every row.
 */
export function findTextContainer(element, ctx) {
  let node = element.parentElement;
  for (let depth = 1; node && depth <= 6; depth++, node = node.parentElement) {
    if (node.localName === 'body' || node.localName === 'html') break;
    const role = getRole(node, ctx.a11y);
    const isContainer = CONTAINER_ROLES.has(role) || ['tr', 'li', 'article', 'fieldset'].includes(node.localName) ||
      /(^|[-_])(card|item|row|tile|entry|record)([-_]|$)/i.test(node.className?.baseVal ?? node.className ?? '');
    if (!isContainer) continue;

    const peerSelector = peerSelectorFor(node);
    let peers;
    try {
      peers = queryCss(peerSelector, ctx.doc);
    } catch {
      continue;
    }
    if (peers.length < 2) continue;

    for (const text of leafTexts(node, element)) {
      const lower = text.toLowerCase();
      const holders = peers.filter((peer) => normalizeWhitespace(peer.textContent).toLowerCase().includes(lower));
      if (holders.length === 1 && holders[0] === node) {
        return { container: node, text, role, peerSelector, depth };
      }
    }
  }
  return null;
}
