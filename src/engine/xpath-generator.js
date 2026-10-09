import { TEST_ID_ATTRIBUTES } from '../shared/constants.js';
import { getLabelTexts } from './accessibility.js';
import { findAnchors, findTextContainer, xpathHasClass, xpathNormalize, xpathTag } from './anchors.js';
import { testIdStability } from './css-generator.js';
import { xpathLiteral } from './escape.js';
import { attributeValueStability, hrefStability, idStability, stableClasses, textStability } from './stability.js';
import { queryXPath } from './validator.js';

const BOTH = ['playwright', 'selenium'];
const MAX_EXACT_TEXT = 60;
const FORM_CONTROLS = new Set(['input', 'select', 'textarea']);

function xpathDescriptor(value, basis, traits = {}) {
  return {
    kind: 'xpath',
    value,
    basis,
    frameworks: BOTH,
    traits: { attributeStability: 0.6, depth: 0, positional: false, ...traits },
  };
}

function matchesOf(expression, ctx) {
  try {
    return queryXPath(expression, ctx.doc, ctx.doc);
  } catch {
    return [];
  }
}

export function isUniqueXPath(expression, target, ctx) {
  const matches = matchesOf(expression, ctx);
  return matches.length === 1 && matches[0] === target;
}

/** Text predicate for an element, or null when text is unsuitable. */
export function textPredicate(element) {
  if (FORM_CONTROLS.has(element.localName)) return null;
  const text = xpathNormalize(element.textContent);
  if (!text) return null;
  if (text.length <= MAX_EXACT_TEXT) {
    return { predicate: `normalize-space(.)=${xpathLiteral(text)}`, text, partial: false };
  }
  const prefix = text.slice(0, 40).replace(/\s+\S*$/, '').trim();
  if (prefix.length < 8) return null;
  return { predicate: `contains(normalize-space(.), ${xpathLiteral(prefix)})`, text: prefix, partial: true };
}

/** Attribute predicates for a single XPath step, most meaningful first. */
function attributePredicates(element) {
  const predicates = [];
  const add = (predicate, basis, stability, extra = {}) => predicates.push({ predicate, basis, stability, ...extra });

  const id = element.getAttribute('id');
  if (id && id.trim()) add(`@id=${xpathLiteral(id)}`, 'id', idStability(id));

  for (const name of TEST_ID_ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (value && value.trim()) add(`@${name}=${xpathLiteral(value)}`, 'testid', testIdStability(value), { equivalent: name === 'data-testid' ? 'testid' : null });
  }

  const name = element.getAttribute('name');
  if (name && name.trim()) {
    add(`@name=${xpathLiteral(name)}`, 'name', attributeValueStability(name));
    const type = (element.getAttribute('type') || '').toLowerCase();
    const value = element.getAttribute('value');
    if ((type === 'radio' || type === 'checkbox') && value) {
      add(`@name=${xpathLiteral(name)} and @value=${xpathLiteral(value)}`, 'name', attributeValueStability(value));
    }
  }

  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) add(`@aria-label=${xpathLiteral(ariaLabel)}`, 'ariaLabel', attributeValueStability(ariaLabel), { equivalent: 'ariaLabel' });

  const placeholder = element.getAttribute('placeholder');
  if (placeholder && placeholder.trim()) add(`@placeholder=${xpathLiteral(placeholder)}`, 'placeholder', attributeValueStability(placeholder) - 0.1, { equivalent: 'placeholder' });

  const alt = element.getAttribute('alt');
  if (alt && alt.trim()) add(`@alt=${xpathLiteral(alt)}`, 'altText', attributeValueStability(alt), { equivalent: 'altText' });

  const title = element.getAttribute('title');
  if (title && title.trim()) add(`@title=${xpathLiteral(title)}`, 'title', attributeValueStability(title) - 0.1, { equivalent: 'title' });

  if (element.localName === 'input') {
    const type = (element.getAttribute('type') || '').toLowerCase();
    const value = element.getAttribute('value');
    if (['button', 'submit', 'reset', 'image'].includes(type) && value) {
      add(`@type=${xpathLiteral(type)} and @value=${xpathLiteral(value)}`, 'value', attributeValueStability(value), { equivalent: 'value' });
    }
  }

  const href = element.localName === 'a' ? element.getAttribute('href') : null;
  if (href && hrefStability(href) >= 0.4) add(`@href=${xpathLiteral(href)}`, 'href', hrefStability(href));

  const role = element.getAttribute('role');
  if (role && role.trim()) add(`@role=${xpathLiteral(role)}`, 'attribute', 0.55);

  const type = element.getAttribute('type');
  if (type) add(`@type=${xpathLiteral(type)}`, 'attribute', 0.5);

  return predicates;
}

function labelXPaths(element) {
  if (!FORM_CONTROLS.has(element.localName)) return [];
  const tag = xpathTag(element);
  const results = [];
  for (const label of element.labels ? Array.from(element.labels) : []) {
    const entry = getLabelTexts(element).find((item) => item.source === 'label');
    if (!entry || entry.clean.length > MAX_EXACT_TEXT) continue;
    const raw = xpathNormalize(label.textContent);
    const labelPredicate = raw === entry.clean
      ? `normalize-space(.)=${xpathLiteral(entry.clean)}`
      : `contains(normalize-space(.), ${xpathLiteral(entry.clean)})`;
    const forAttr = label.getAttribute('for');
    if (forAttr && element.id === forAttr) {
      results.push({ expression: `//${tag}[@id=//label[${labelPredicate}]/@for]`, text: entry.clean });
    } else if (label.contains(element)) {
      results.push({ expression: `//label[${labelPredicate}]//${tag}`, text: entry.clean });
    }
    break;
  }
  return results;
}

/** Absolute path, only used when nothing else identifies the element. */
export function absoluteXPath(element) {
  const steps = [];
  for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
    const parent = node.parentElement;
    const tag = xpathTag(node);
    if (!parent) {
      steps.unshift(tag);
      break;
    }
    const sameTag = Array.from(parent.children).filter((sibling) => sibling.localName === node.localName);
    steps.unshift(sameTag.length > 1 ? `${tag}[${sameTag.indexOf(node) + 1}]` : tag);
  }
  return '/' + steps.join('/');
}

export function generateXPathCandidates(element, ctx) {
  const tag = xpathTag(element);
  const results = [];
  const predicates = attributePredicates(element);
  let foundUnique = false;
  const markUnique = (expression) => {
    const unique = isUniqueXPath(expression, element, ctx);
    foundUnique ||= unique;
    return unique;
  };

  for (const entry of predicates.slice(0, 8)) {
    const expression = `//${tag}[${entry.predicate}]`;
    const unique = markUnique(expression);
    if (unique || entry.basis !== 'attribute') {
      results.push(xpathDescriptor(expression, entry.basis, { attributeStability: entry.stability, equivalent: entry.equivalent ?? null }));
    }
  }

  const text = textPredicate(element);
  if (text) {
    const expression = `//${tag}[${text.predicate}]`;
    markUnique(expression);
    results.push(xpathDescriptor(expression, 'text', {
      attributeStability: textStability(text.text) - (text.partial ? 0.15 : 0),
      textBased: true,
      partialText: text.partial,
      equivalent: 'text',
    }));

    if (!isUniqueXPath(expression, element, ctx)) {
      const typed = predicates.find((entry) => entry.basis === 'attribute' && entry.predicate.startsWith('@type'));
      if (typed) {
        const combined = `//${tag}[${typed.predicate} and ${text.predicate}]`;
        if (markUnique(combined)) {
          results.push(xpathDescriptor(combined, 'text', { attributeStability: textStability(text.text), textBased: true, equivalent: 'text' }));
        }
      }
    }
  }

  for (const label of labelXPaths(element)) {
    markUnique(label.expression);
    results.push(xpathDescriptor(label.expression, 'label', {
      attributeStability: textStability(label.text),
      textBased: true,
      equivalent: 'label',
    }));
  }

  const stableBases = [
    ...predicates.filter((entry) => entry.basis !== 'id' && entry.basis !== 'testid').map((entry) => entry.predicate),
    ...(text ? [text.predicate] : []),
    ...stableClasses(element).slice(0, 2).map(xpathHasClass),
  ];

  if (!foundUnique) {
    const container = findTextContainer(element, ctx);
    if (container && stableBases.length) {
      const containerTag = xpathTag(container.container);
      const scopeStep = `//${containerTag}[.//*[normalize-space(.)=${xpathLiteral(container.text)}]]`;
      for (const predicate of stableBases) {
        const expression = `${scopeStep}//${tag}[${predicate}]`;
        if (markUnique(expression)) {
          results.push(xpathDescriptor(expression, 'text', {
            attributeStability: Math.min(textStability(container.text), 0.8),
            depth: 1,
            textBased: true,
            scoped: true,
          }));
          break;
        }
      }
    }
  }

  if (!foundUnique) {
    const anchors = findAnchors(element, ctx, 3);
    let anchored = 0;
    for (const anchor of anchors) {
      for (const predicate of [...stableBases, null]) {
        const expression = `${anchor.xpath}//${tag}${predicate ? `[${predicate}]` : ''}`;
        if (markUnique(expression)) {
          results.push(xpathDescriptor(expression, anchor.basis === 'testid' || anchor.basis === 'id' ? 'attribute' : 'structure', {
            attributeStability: Math.min(anchor.stability, predicate ? 0.7 : 0.5),
            depth: 1,
            anchored: true,
          }));
          anchored++;
          break;
        }
      }
      if (anchored >= 2) break;
    }
  }

  if (!foundUnique) {
    const base = text ? `//${tag}[${text.predicate}]` : predicates[0] ? `//${tag}[${predicates[0].predicate}]` : `//${tag}`;
    const matches = matchesOf(base, ctx);
    const index = matches.indexOf(element);
    if (index !== -1 && matches.length > 1 && matches.length <= 20) {
      const expression = `(${base})[${index + 1}]`;
      if (markUnique(expression)) {
        results.push(xpathDescriptor(expression, 'structure', { attributeStability: 0.3, positional: true }));
      }
    }
  }

  if (!foundUnique) {
    results.push(xpathDescriptor(absoluteXPath(element), 'absolute', {
      attributeStability: 0.05,
      absolute: true,
      positional: true,
    }));
  }

  return results;
}
