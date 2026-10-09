import { PLAYWRIGHT_TEST_ID_ATTRIBUTE, VALIDATION_STATUS } from '../shared/constants.js';
import {
  createA11yCache,
  getAccessibleName,
  getLabelTexts,
  getRole,
  isHiddenForAccessibility,
  roleQuerySelector,
} from './accessibility.js';
import { cssAttr, cssEscape, normalizeWhitespace } from './escape.js';
import { isOverlayElement, visibleTextContent } from './dom-inspector.js';

const ELEMENT_NODE = 1;
const TEXT_SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'head', 'title', 'meta', 'link', 'html']);

export class SelectorError extends Error {}

/**
 * Per-analysis query context. Caches are only valid while the DOM is
 * unchanged, so a new context is created for every analysis run.
 */
export function createQueryContext(doc) {
  return {
    doc,
    a11y: createA11yCache(),
    text: new Map(),
  };
}

function isElement(node) {
  return node?.nodeType === ELEMENT_NODE;
}

function keep(elements) {
  return elements.filter((element) => isElement(element) && !isOverlayElement(element));
}

function documentOrder(elements) {
  const unique = Array.from(new Set(elements));
  return unique.sort((a, b) => {
    if (a === b) return 0;
    return a.compareDocumentPosition(b) & 4 ? -1 : 1;
  });
}

export function queryCss(selector, root) {
  try {
    return keep(Array.from(root.querySelectorAll(selector)));
  } catch (error) {
    throw new SelectorError(`Invalid CSS selector: ${error.message}`);
  }
}

export function queryXPath(expression, root, doc) {
  const ownerDocument = doc ?? root.ownerDocument ?? root;
  const XPathResultCtor = ownerDocument.defaultView?.XPathResult ?? globalThis.XPathResult;
  let result;
  try {
    result = ownerDocument.evaluate(expression, root, null, XPathResultCtor.ORDERED_NODE_SNAPSHOT_TYPE, null);
  } catch (error) {
    throw new SelectorError(`Invalid XPath: ${error.message}`);
  }
  const nodes = [];
  for (let index = 0; index < result.snapshotLength; index++) nodes.push(result.snapshotItem(index));
  return keep(nodes);
}

/** Playwright-style string matching: normalised whitespace; substring + case-insensitive unless exact. */
export function matchesText(actual, expected, exact) {
  const haystack = normalizeWhitespace(actual);
  const needle = normalizeWhitespace(expected);
  if (exact) return haystack === needle;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function elementText(element, ctx) {
  if (ctx.text.has(element)) return ctx.text.get(element);
  let text;
  const tag = element.localName;
  if (tag === 'input') {
    const type = (element.getAttribute('type') || '').toLowerCase();
    text = ['button', 'submit', 'reset'].includes(type) ? element.getAttribute('value') || '' : '';
  } else {
    text = normalizeWhitespace(element.textContent);
  }
  ctx.text.set(element, text);
  return text;
}

function queryRole(role, options, root, ctx) {
  const pool = queryCss(roleQuerySelector(role), root);
  return pool.filter((element) => {
    if (getRole(element, ctx.a11y) !== role) return false;
    if (isHiddenForAccessibility(element, ctx.a11y)) return false;
    if (options?.name === undefined) return true;
    return matchesText(getAccessibleName(element, ctx.a11y).name, options.name, options.exact);
  });
}

function queryLabel(text, exact, root) {
  const pool = queryCss('input, select, textarea, button, meter, output, progress, [aria-label], [aria-labelledby]', root);
  return pool.filter((element) => {
    if (element.localName === 'input' && (element.getAttribute('type') || '').toLowerCase() === 'hidden') return false;
    return getLabelTexts(element).some((entry) => matchesText(entry.text, text, exact));
  });
}

function queryAttributeText(attribute, text, exact, root) {
  return queryCss(`[${attribute}]`, root).filter((element) =>
    matchesText(element.getAttribute(attribute), text, exact),
  );
}

/** Emulates Playwright's getByText(): the deepest elements whose text matches. */
function queryText(text, exact, root, ctx) {
  const scope = root.nodeType === 9 ? root.body ?? root.documentElement : root;
  if (!scope) return [];
  const candidates = keep(Array.from(scope.querySelectorAll('*'))).filter(
    (element) => !TEXT_SKIP_TAGS.has(element.localName) && matchesText(elementText(element, ctx), text, exact),
  );
  const matched = new Set(candidates);
  return candidates.filter((element) => !Array.from(element.children).some((child) => matched.has(child)));
}

function queryLinkText(text, partial, root) {
  return queryCss('a', root).filter((element) => {
    const linkText = normalizeWhitespace(element.innerText ?? visibleTextContent(element));
    return partial ? linkText.includes(text) : linkText === normalizeWhitespace(text);
  });
}

/** Resolves one step (without scope) relative to a root node. */
function queryStep(descriptor, root, ctx) {
  const { kind, value, options = {} } = descriptor;
  switch (kind) {
    case 'css':
      return queryCss(value, root);
    case 'xpath':
      return queryXPath(value, root, ctx.doc);
    case 'id':
      return queryCss(cssAttr('id', value), root);
    case 'name':
      return queryCss(cssAttr('name', value), root);
    case 'className':
      if (/\s/.test(value)) throw new SelectorError('Compound class names are not permitted in By.className()');
      return queryCss(`.${cssEscape(value)}`, root);
    case 'linkText':
      return queryLinkText(value, false, root);
    case 'partialLinkText':
      return queryLinkText(value, true, root);
    case 'role':
      return queryRole(value, options, root, ctx);
    case 'label':
      return queryLabel(value, options.exact, root);
    case 'placeholder':
      return queryAttributeText('placeholder', value, options.exact, root);
    case 'altText':
      return queryAttributeText('alt', value, options.exact, root);
    case 'title':
      return queryAttributeText('title', value, options.exact, root);
    case 'testid':
      return queryCss(cssAttr(PLAYWRIGHT_TEST_ID_ATTRIBUTE, value), root);
    case 'text':
      return queryText(value, options.exact, root, ctx);
    default:
      throw new SelectorError(`Unsupported locator kind: ${kind}`);
  }
}

/** Resolves a (possibly chained/filtered) descriptor to matching elements. */
export function resolveDescriptor(descriptor, ctx) {
  const roots = descriptor.scope ? resolveDescriptor(descriptor.scope, ctx) : [ctx.doc];
  let results = [];
  for (const root of roots) results.push(...queryStep(descriptor, root, ctx));
  if (roots.length > 1) results = documentOrder(results);
  if (descriptor.filter?.hasText) {
    results = results.filter((element) => matchesText(elementText(element, ctx), descriptor.filter.hasText, false));
  }
  return results;
}

/**
 * Validates a descriptor against the live document and reports whether it
 * uniquely identifies the intended target. Never throws.
 */
export function validateDescriptor(descriptor, target, ctx) {
  try {
    const matches = resolveDescriptor(descriptor, ctx);
    const matchCount = matches.length;
    const targetIndex = matches.indexOf(target);
    return {
      status: VALIDATION_STATUS.VERIFIED,
      matchCount,
      isUnique: matchCount === 1,
      matchesTarget: matchCount === 1 && matches[0] === target,
      targetIncluded: targetIndex !== -1,
      targetIndex,
      error: null,
    };
  } catch (error) {
    return {
      status: error instanceof SelectorError ? VALIDATION_STATUS.ERROR : VALIDATION_STATUS.UNVERIFIED,
      matchCount: null,
      isUnique: false,
      matchesTarget: false,
      targetIncluded: false,
      targetIndex: -1,
      error: error.message || String(error),
    };
  }
}

/** Validates a raw CSS or XPath string typed by a user or test. */
export function validateSelector(kind, selector, target, doc) {
  return validateDescriptor({ kind, value: selector }, target, createQueryContext(doc));
}
