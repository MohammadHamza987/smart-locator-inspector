import { TEST_ID_ATTRIBUTES } from '../shared/constants.js';
import { findAnchors, isUniqueCss } from './anchors.js';
import { cssAttr, cssEscape, idSelector } from './escape.js';
import { attributeValueStability, classifyClass, hrefStability, idStability, stableClasses } from './stability.js';

const BOTH = ['playwright', 'selenium'];
const MAX_STRUCTURAL_DEPTH = 6;
const BUTTON_INPUT_TYPES = new Set(['button', 'submit', 'reset', 'image']);

function cssDescriptor(value, basis, traits = {}) {
  return {
    kind: 'css',
    value,
    basis,
    frameworks: BOTH,
    traits: { attributeStability: 0.6, depth: 0, positional: false, ...traits },
  };
}

export function testIdStability(value) {
  const stability = attributeValueStability(value);
  return stability >= 0.6 ? 0.95 : stability;
}

/**
 * Simple single-element attribute selectors, most meaningful first.
 * `equivalent` links a selector to the Playwright semantic it mirrors.
 */
export function attributeSelectors(element) {
  const tag = cssEscape(element.localName);
  const selectors = [];
  const add = (selector, basis, stability, extra = {}) => selectors.push({ selector, basis, stability, ...extra });

  for (const name of TEST_ID_ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (value && value.trim()) add(cssAttr(name, value), 'testid', testIdStability(value), { equivalent: name === 'data-testid' ? 'testid' : null });
  }

  const id = element.getAttribute('id');
  if (id && id.trim()) add(idSelector(id), 'id', idStability(id));

  const name = element.getAttribute('name');
  if (name && name.trim()) {
    add(`${tag}${cssAttr('name', name)}`, 'name', attributeValueStability(name));
    const type = (element.getAttribute('type') || '').toLowerCase();
    const value = element.getAttribute('value');
    if ((type === 'radio' || type === 'checkbox') && value) {
      add(`${tag}${cssAttr('name', name)}${cssAttr('value', value)}`, 'name', attributeValueStability(value));
    }
  }

  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) add(`${tag}${cssAttr('aria-label', ariaLabel)}`, 'ariaLabel', attributeValueStability(ariaLabel), { equivalent: 'ariaLabel' });

  const placeholder = element.getAttribute('placeholder');
  if (placeholder && placeholder.trim()) add(`${tag}${cssAttr('placeholder', placeholder)}`, 'placeholder', attributeValueStability(placeholder) - 0.1, { equivalent: 'placeholder' });

  const alt = element.getAttribute('alt');
  if (alt && alt.trim()) add(`${tag}${cssAttr('alt', alt)}`, 'altText', attributeValueStability(alt), { equivalent: 'altText' });

  const title = element.getAttribute('title');
  if (title && title.trim()) add(`${tag}${cssAttr('title', title)}`, 'title', attributeValueStability(title) - 0.1, { equivalent: 'title' });

  if (element.localName === 'input') {
    const type = (element.getAttribute('type') || '').toLowerCase();
    const value = element.getAttribute('value');
    if (BUTTON_INPUT_TYPES.has(type) && value) {
      add(`${tag}${cssAttr('type', type)}${cssAttr('value', value)}`, 'value', attributeValueStability(value), { equivalent: 'value' });
    }
  }

  const href = element.localName === 'a' ? element.getAttribute('href') : null;
  if (href && hrefStability(href) >= 0.4) add(`${tag}${cssAttr('href', href)}`, 'href', hrefStability(href));

  const forAttr = element.localName === 'label' ? element.getAttribute('for') : null;
  if (forAttr) add(`label${cssAttr('for', forAttr)}`, 'attribute', idStability(forAttr));

  const role = element.getAttribute('role');
  if (role && role.trim()) add(`${tag}${cssAttr('role', role)}`, 'attribute', 0.55);

  const type = element.getAttribute('type');
  if (type && element.localName !== 'input') add(`${tag}${cssAttr('type', type)}`, 'attribute', 0.5);
  else if (type && element.localName === 'input') add(`input${cssAttr('type', type)}`, 'attribute', 0.5);

  for (const attribute of Array.from(element.attributes)) {
    if (!attribute.name.startsWith('data-') || TEST_ID_ATTRIBUTES.includes(attribute.name)) continue;
    const value = attribute.value;
    if (!value || value.length > 40 || /^(true|false|\d+)$/i.test(value)) continue;
    const stability = attributeValueStability(value);
    if (stability >= 0.6) add(`${tag}${cssAttr(attribute.name, value)}`, 'attribute', stability - 0.1);
    if (selectors.length > 16) break;
  }

  return selectors;
}

function classSelectors(element, ctx) {
  const tag = cssEscape(element.localName);
  const classes = stableClasses(element).slice(0, 5);
  const results = [];
  for (const className of classes) {
    const selector = `${tag}.${cssEscape(className)}`;
    if (isUniqueCss(selector, element, ctx)) results.push(selector);
  }
  if (!results.length) {
    for (let i = 0; i < classes.length && results.length < 1; i++) {
      for (let j = i + 1; j < classes.length; j++) {
        const selector = `${tag}.${cssEscape(classes[i])}.${cssEscape(classes[j])}`;
        if (isUniqueCss(selector, element, ctx)) {
          results.push(selector);
          break;
        }
      }
    }
  }
  return results.slice(0, 2);
}

function nthOfType(element) {
  let index = 1;
  let total = 0;
  const parent = element.parentElement;
  if (!parent) return { index: 1, total: 1 };
  for (const sibling of parent.children) {
    if (sibling.localName === element.localName) {
      total++;
      if (sibling === element) index = total;
    }
  }
  return { index, total };
}

/** Last-resort path from the nearest anchor (or body) using :nth-of-type where needed. */
export function structuralCss(element, ctx, anchor) {
  const steps = [];
  let positional = false;
  let node = element;
  const stop = anchor?.element ?? element.ownerDocument.body;
  while (node && node !== stop && steps.length < MAX_STRUCTURAL_DEPTH) {
    const { index, total } = nthOfType(node);
    const tag = cssEscape(node.localName);
    if (total > 1) {
      steps.unshift(`${tag}:nth-of-type(${index})`);
      positional = true;
    } else {
      steps.unshift(tag);
    }
    node = node.parentElement;
  }
  const prefix = node === stop ? (anchor ? anchor.css : 'body') : null;
  const selector = prefix ? `${prefix} > ${steps.join(' > ')}` : steps.join(' > ');
  return { selector, positional, depth: steps.length };
}

function hasDynamicClassOnly(element) {
  const classes = Array.from(element.classList || []);
  return classes.length > 0 && classes.every((name) => classifyClass(name) !== 'semantic');
}

export function generateCssCandidates(element, ctx) {
  const tag = cssEscape(element.localName);
  const results = [];
  const simple = attributeSelectors(element);
  let foundUnique = false;

  for (const entry of simple) {
    let selector = entry.selector;
    let unique = isUniqueCss(selector, element, ctx);
    if (!unique && !selector.startsWith(tag)) {
      const tagged = `${tag}${selector}`;
      if (isUniqueCss(tagged, element, ctx)) {
        selector = tagged;
        unique = true;
      }
    }
    foundUnique ||= unique && entry.stability >= 0.5;
    results.push(cssDescriptor(selector, entry.basis, { attributeStability: entry.stability, equivalent: entry.equivalent ?? null }));
  }

  if (!foundUnique) {
    const pairable = simple.filter((entry) => entry.basis !== 'id' && entry.basis !== 'testid' && entry.selector.startsWith(tag));
    outer: for (let i = 0; i < pairable.length; i++) {
      for (let j = i + 1; j < pairable.length; j++) {
        const selector = pairable[i].selector + pairable[j].selector.slice(tag.length);
        if (isUniqueCss(selector, element, ctx)) {
          results.push(cssDescriptor(selector, pairable[i].basis, {
            attributeStability: Math.min(pairable[i].stability, pairable[j].stability),
          }));
          foundUnique = true;
          break outer;
        }
      }
    }
  }

  for (const selector of classSelectors(element, ctx)) {
    results.push(cssDescriptor(selector, 'class', { attributeStability: 0.5, usesClasses: true }));
    foundUnique = true;
  }

  const anchors = findAnchors(element, ctx, 3);
  if (!foundUnique || results.every((descriptor) => (descriptor.traits.attributeStability ?? 0) < 0.6)) {
    const bases = [
      ...simple.filter((entry) => entry.basis !== 'id' && entry.basis !== 'testid').map((entry) =>
        entry.selector.startsWith(tag) ? entry.selector : `${tag}${entry.selector}`,
      ),
      ...stableClasses(element).slice(0, 2).map((className) => `${tag}.${cssEscape(className)}`),
      tag,
    ];
    let anchoredCount = 0;
    for (const anchor of anchors) {
      for (const base of bases) {
        const selector = `${anchor.css} ${base}`;
        if (isUniqueCss(selector, element, ctx)) {
          results.push(cssDescriptor(selector, anchor.basis === 'testid' || anchor.basis === 'id' ? 'attribute' : 'structure', {
            attributeStability: Math.min(anchor.stability, base === tag ? 0.55 : 0.7),
            depth: 1,
            anchored: true,
          }));
          anchoredCount++;
          foundUnique = true;
          break;
        }
      }
      if (anchoredCount >= 2) break;
    }
  }

  if (!foundUnique) {
    const structural = structuralCss(element, ctx, anchors[0]);
    results.push(cssDescriptor(structural.selector, 'structure', {
      attributeStability: anchors[0] ? 0.4 : 0.25,
      depth: structural.depth,
      positional: structural.positional,
      dynamicClass: hasDynamicClassOnly(element),
    }));
  }

  return results;
}
