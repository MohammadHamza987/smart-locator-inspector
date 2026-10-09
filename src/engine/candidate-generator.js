import { PLAYWRIGHT_TEST_ID_ATTRIBUTE } from '../shared/constants.js';
import {
  LOCATOR_WORTHY_ROLES,
  NAMELESS_ROLES,
  getAccessibleName,
  getLabelTexts,
  getRole,
} from './accessibility.js';
import { findAnchors, findTextContainer } from './anchors.js';
import { generateCssCandidates, testIdStability } from './css-generator.js';
import { visibleTextContent } from './dom-inspector.js';
import { cssEscape, normalizeWhitespace } from './escape.js';
import { attributeValueStability, idStability, stableClasses, textStability } from './stability.js';
import { queryCss, validateDescriptor } from './validator.js';
import { generateXPathCandidates } from './xpath-generator.js';

const PLAYWRIGHT = ['playwright'];
const SELENIUM = ['selenium'];
const MAX_NAME_LENGTH = 100;
const MAX_TEXT_LENGTH = 60;
const LABEL_TARGETS = new Set(['input', 'select', 'textarea']);
const NAME_SOURCES_FROM_TEXT = new Set(['content', 'label', 'legend', 'caption', 'aria-labelledby']);

function semantic(kind, value, options, basis, traits) {
  return {
    kind,
    value,
    options: options ?? {},
    basis,
    frameworks: PLAYWRIGHT,
    traits: { attributeStability: 0.7, depth: 0, positional: false, ...traits },
  };
}

/**
 * Playwright matches names/text case-insensitively by substring. When that is
 * ambiguous but an exact match is unique, switch to { exact: true }.
 */
function preferUnique(descriptor, element, ctx) {
  const loose = validateDescriptor(descriptor, element, ctx);
  if (loose.matchesTarget || !loose.targetIncluded) return descriptor;
  const exactDescriptor = {
    ...descriptor,
    options: { ...descriptor.options, exact: true },
    traits: { ...descriptor.traits, exact: true },
  };
  const exact = validateDescriptor(exactDescriptor, element, ctx);
  return exact.matchesTarget ? exactDescriptor : descriptor;
}

function roleCandidate(element, ctx) {
  const role = getRole(element, ctx.a11y);
  if (!role || !LOCATOR_WORTHY_ROLES.has(role)) return null;
  const { name, source } = getAccessibleName(element, ctx.a11y);
  if (name && name.length <= MAX_NAME_LENGTH) {
    const stability = NAME_SOURCES_FROM_TEXT.has(source) ? textStability(name) : attributeValueStability(name);
    return semantic('role', role, { name }, 'role', {
      attributeStability: stability,
      nameSource: source,
      textBased: source === 'content',
      explicitRole: Boolean(element.getAttribute('role')),
    });
  }
  if (!name && NAMELESS_ROLES.has(role)) {
    return semantic('role', role, {}, 'roleNameless', { attributeStability: 0.55 });
  }
  return null;
}

function labelCandidate(element) {
  if (!LABEL_TARGETS.has(element.localName) && !element.hasAttribute('aria-labelledby')) return null;
  const entry = getLabelTexts(element).find((item) => item.clean && item.clean.length <= MAX_NAME_LENGTH);
  if (!entry) return null;
  return semantic('label', entry.clean, {}, 'label', {
    attributeStability: entry.source === 'aria-label' ? attributeValueStability(entry.clean) : textStability(entry.clean),
    labelSource: entry.source,
  });
}

function textCandidate(element) {
  const tag = element.localName;
  if (tag === 'select' || tag === 'textarea') return null;
  let text;
  if (tag === 'input') {
    const type = (element.getAttribute('type') || '').toLowerCase();
    if (!['button', 'submit', 'reset'].includes(type)) return null;
    text = normalizeWhitespace(element.getAttribute('value'));
  } else {
    text = normalizeWhitespace(element.textContent);
  }
  if (!text || text.length > MAX_TEXT_LENGTH) return null;
  return semantic('text', text, {}, 'text', { attributeStability: textStability(text), textBased: true });
}

export function playwrightSemanticCandidates(element, ctx) {
  const results = [];

  const testId = element.getAttribute(PLAYWRIGHT_TEST_ID_ATTRIBUTE);
  if (testId && testId.trim()) {
    results.push(semantic('testid', testId, {}, 'testid', { attributeStability: testIdStability(testId) }));
  }

  const role = roleCandidate(element, ctx);
  if (role) results.push(preferUnique(role, element, ctx));

  const label = labelCandidate(element);
  if (label) results.push(preferUnique(label, element, ctx));

  const placeholder = element.getAttribute('placeholder');
  if (placeholder && placeholder.trim() && LABEL_TARGETS.has(element.localName)) {
    const value = normalizeWhitespace(placeholder);
    results.push(preferUnique(semantic('placeholder', value, {}, 'placeholder', {
      attributeStability: attributeValueStability(value) - 0.1,
    }), element, ctx));
  }

  const alt = element.getAttribute('alt');
  if (alt && alt.trim() && ['img', 'area', 'input'].includes(element.localName)) {
    const value = normalizeWhitespace(alt);
    results.push(preferUnique(semantic('altText', value, {}, 'altText', { attributeStability: attributeValueStability(value) }), element, ctx));
  }

  const title = element.getAttribute('title');
  if (title && title.trim()) {
    const value = normalizeWhitespace(title);
    results.push(preferUnique(semantic('title', value, {}, 'title', { attributeStability: attributeValueStability(value) - 0.1 }), element, ctx));
  }

  const text = textCandidate(element);
  if (text) results.push(preferUnique(text, element, ctx));

  return results;
}

/** Narrows ambiguous semantic locators with a uniquely identifiable ancestor. */
function scopedSemanticCandidates(bases, element, ctx) {
  const ambiguous = bases.filter((descriptor) => {
    const validation = validateDescriptor(descriptor, element, ctx);
    return validation.targetIncluded && !validation.isUnique;
  }).slice(0, 2);
  if (!ambiguous.length) return [];

  const scopes = [];
  for (const anchor of findAnchors(element, ctx, 2)) {
    if (anchor.basis === 'testid' && anchor.testIdAttribute === PLAYWRIGHT_TEST_ID_ATTRIBUTE) {
      scopes.push({ scope: { kind: 'testid', value: anchor.testIdValue, options: {} }, stability: anchor.stability });
    } else if (anchor.basis === 'id' || anchor.basis === 'testid' || anchor.basis === 'attribute') {
      scopes.push({ scope: { kind: 'css', value: anchor.css, options: {} }, stability: anchor.stability });
    }
  }
  const container = findTextContainer(element, ctx);
  if (container) {
    const scope = container.role && ['row', 'listitem', 'article', 'group', 'region', 'dialog', 'tabpanel'].includes(container.role)
      ? { kind: 'role', value: container.role, options: {}, filter: { hasText: container.text } }
      : { kind: 'css', value: container.peerSelector, options: {}, filter: { hasText: container.text } };
    scopes.push({ scope, stability: Math.min(0.75, textStability(container.text)) });
  }

  const results = [];
  for (const base of ambiguous) {
    for (const { scope, stability } of scopes) {
      const descriptor = {
        ...base,
        scope,
        traits: {
          ...base.traits,
          attributeStability: Math.min(base.traits.attributeStability, stability + 0.1),
          depth: 1,
          scoped: true,
        },
      };
      const scoped = preferUnique(descriptor, element, ctx);
      if (validateDescriptor(scoped, element, ctx).matchesTarget) {
        results.push(scoped);
        break;
      }
    }
  }
  return results;
}

export function seleniumCandidates(element, ctx) {
  const results = [];
  const id = element.getAttribute('id');
  if (id && id.trim()) {
    results.push({ kind: 'id', value: id, basis: 'id', frameworks: SELENIUM, traits: { attributeStability: idStability(id), depth: 0 } });
  }
  const name = element.getAttribute('name');
  if (name && name.trim()) {
    results.push({ kind: 'name', value: name, basis: 'name', frameworks: SELENIUM, traits: { attributeStability: attributeValueStability(name), depth: 0 } });
  }
  for (const className of stableClasses(element).slice(0, 4)) {
    const matches = queryCss(`.${cssEscape(className)}`, ctx.doc);
    if (matches.length === 1 && matches[0] === element) {
      results.push({ kind: 'className', value: className, basis: 'class', frameworks: SELENIUM, traits: { attributeStability: 0.5, depth: 0, usesClasses: true } });
      break;
    }
  }
  if (element.localName === 'a' && element.hasAttribute('href')) {
    const text = normalizeWhitespace(element.innerText ?? visibleTextContent(element));
    if (text && text.length <= MAX_TEXT_LENGTH) {
      results.push({ kind: 'linkText', value: text, basis: 'linkText', frameworks: SELENIUM, traits: { attributeStability: textStability(text), textBased: true, depth: 0 } });
    }
    if (text && text.length > 30) {
      const partial = text.slice(0, 30).replace(/\s+\S*$/, '').trim();
      if (partial.length >= 6) {
        results.push({ kind: 'partialLinkText', value: partial, basis: 'partialLinkText', frameworks: SELENIUM, traits: { attributeStability: textStability(partial) - 0.1, textBased: true, depth: 0 } });
      }
    }
  }
  return results;
}

export function generateCandidates(element, ctx) {
  const semanticBases = playwrightSemanticCandidates(element, ctx);
  return [
    ...semanticBases,
    ...scopedSemanticCandidates(semanticBases, element, ctx),
    ...seleniumCandidates(element, ctx),
    ...generateCssCandidates(element, ctx),
    ...generateXPathCandidates(element, ctx),
  ];
}

export function descriptorKey(descriptor) {
  const scope = descriptor.scope ? `${descriptorKey(descriptor.scope)}>>` : '';
  const filter = descriptor.filter?.hasText ? `|has=${descriptor.filter.hasText}` : '';
  return `${scope}${descriptor.kind}:${descriptor.value}:${JSON.stringify(descriptor.options ?? {})}${filter}`;
}
