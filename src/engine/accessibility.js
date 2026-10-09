import { normalizeWhitespace } from './escape.js';

/**
 * A pragmatic subset of WAI-ARIA role mapping and the Accessible Name and
 * Description Computation (accname 1.2), aligned with the behaviour of
 * Playwright's getByRole() where practical.
 *
 * Known gaps (documented in README): CSS generated content (::before/::after),
 * shadow-DOM slot flattening, and some host-language edge cases.
 */

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

const VALID_ROLES = new Set([
  'alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote', 'button', 'caption',
  'cell', 'checkbox', 'code', 'columnheader', 'combobox', 'complementary', 'contentinfo',
  'definition', 'deletion', 'dialog', 'directory', 'document', 'emphasis', 'feed', 'figure',
  'form', 'generic', 'grid', 'gridcell', 'group', 'heading', 'img', 'insertion', 'link', 'list',
  'listbox', 'listitem', 'log', 'main', 'mark', 'marquee', 'math', 'menu', 'menubar', 'menuitem',
  'menuitemcheckbox', 'menuitemradio', 'meter', 'navigation', 'none', 'note', 'option',
  'paragraph', 'presentation', 'progressbar', 'radio', 'radiogroup', 'region', 'row', 'rowgroup',
  'rowheader', 'scrollbar', 'search', 'searchbox', 'separator', 'slider', 'spinbutton', 'status',
  'strong', 'subscript', 'superscript', 'switch', 'tab', 'table', 'tablist', 'tabpanel', 'term',
  'textbox', 'time', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem',
]);

/** Roles whose accessible name may be computed from their content. */
const NAME_FROM_CONTENT_ROLES = new Set([
  'button', 'cell', 'checkbox', 'columnheader', 'gridcell', 'heading', 'link', 'menuitem',
  'menuitemcheckbox', 'menuitemradio', 'option', 'radio', 'row', 'rowheader', 'switch', 'tab',
  'tooltip', 'treeitem',
]);

/** Roles meaningful enough to use in getByRole() locators. */
export const LOCATOR_WORTHY_ROLES = new Set([
  'alert', 'alertdialog', 'article', 'banner', 'button', 'cell', 'checkbox', 'columnheader',
  'combobox', 'complementary', 'contentinfo', 'dialog', 'form', 'grid', 'gridcell', 'heading',
  'img', 'link', 'list', 'listbox', 'listitem', 'main', 'menu', 'menubar', 'menuitem',
  'menuitemcheckbox', 'menuitemradio', 'meter', 'navigation', 'option', 'progressbar', 'radio',
  'radiogroup', 'region', 'row', 'rowheader', 'search', 'searchbox', 'slider', 'spinbutton',
  'status', 'switch', 'tab', 'table', 'tablist', 'tabpanel', 'textbox', 'toolbar', 'tooltip',
  'tree', 'treegrid', 'treeitem',
]);

/** Roles that are fine to target without an accessible name when unique. */
export const NAMELESS_ROLES = new Set([
  'banner', 'contentinfo', 'main', 'navigation', 'search', 'complementary', 'dialog', 'alertdialog',
  'menubar', 'tablist', 'toolbar', 'tree', 'grid', 'table', 'textbox', 'searchbox', 'combobox',
  'checkbox', 'slider', 'spinbutton', 'progressbar',
]);

const LABELABLE = new Set(['input', 'select', 'textarea', 'button', 'meter', 'output', 'progress']);

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'dd', 'details', 'dialog', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'tbody',
  'td', 'tfoot', 'th', 'thead', 'tr', 'ul', 'caption', 'legend', 'option',
]);

const SKIP_CONTENT_TAGS = new Set(['script', 'style', 'template', 'noscript', 'head', 'title', 'meta', 'link']);

/** Tag names that can carry each implicit role; used to pre-filter role queries. */
const IMPLICIT_ROLE_TAGS = {
  button: 'button, input, summary',
  link: 'a, area',
  textbox: 'input, textarea',
  searchbox: 'input',
  combobox: 'input, select',
  listbox: 'select, datalist',
  checkbox: 'input',
  radio: 'input',
  slider: 'input',
  spinbutton: 'input',
  option: 'option',
  heading: 'h1, h2, h3, h4, h5, h6',
  img: 'img, svg',
  presentation: 'img',
  navigation: 'nav',
  main: 'main',
  complementary: 'aside',
  banner: 'header',
  contentinfo: 'footer',
  form: 'form',
  region: 'section',
  article: 'article',
  dialog: 'dialog',
  list: 'ul, ol, menu',
  listitem: 'li',
  table: 'table',
  row: 'tr',
  cell: 'td',
  gridcell: 'td',
  columnheader: 'th',
  rowheader: 'th',
  rowgroup: 'thead, tbody, tfoot',
  group: 'fieldset, details, optgroup, address',
  progressbar: 'progress',
  meter: 'meter',
  status: 'output',
  separator: 'hr',
  figure: 'figure',
  paragraph: 'p',
  blockquote: 'blockquote',
  caption: 'caption',
  search: 'search',
  strong: 'strong, b',
  emphasis: 'em, i',
  code: 'code',
};

export function roleQuerySelector(role) {
  const tags = IMPLICIT_ROLE_TAGS[role];
  return tags ? `[role], ${tags}` : '[role]';
}

export function createA11yCache() {
  return { hidden: new Map(), roles: new Map(), names: new Map() };
}

function tagName(element) {
  return (element.localName || '').toLowerCase();
}

function getIdRefs(element, attribute) {
  const value = element.getAttribute(attribute);
  if (!value) return [];
  const root = element.getRootNode?.() ?? element.ownerDocument;
  const doc = element.ownerDocument;
  return value
    .trim()
    .split(/\s+/)
    .map((id) => (root.getElementById ? root.getElementById(id) : null) ?? doc.getElementById(id))
    .filter(Boolean);
}

export function getExplicitRole(element) {
  const attribute = element.getAttribute?.('role');
  if (!attribute) return null;
  for (const token of attribute.trim().toLowerCase().split(/\s+/)) {
    if (VALID_ROLES.has(token)) return token;
  }
  return null;
}

function hasGlobalNameAttribute(element) {
  return Boolean(
    element.getAttribute('aria-label')?.trim() ||
      element.getAttribute('aria-labelledby')?.trim() ||
      element.getAttribute('title')?.trim(),
  );
}

function inputType(element) {
  const raw = (element.getAttribute('type') || 'text').trim().toLowerCase();
  return raw || 'text';
}

function hasDatalist(element) {
  const list = getIdRefs(element, 'list')[0];
  return Boolean(list && tagName(list) === 'datalist');
}

const INPUT_TYPE_ROLES = {
  button: 'button',
  submit: 'button',
  reset: 'button',
  image: 'button',
  file: 'button',
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'slider',
  number: 'spinbutton',
};

function isInsideSectioning(element) {
  return Boolean(element.parentElement?.closest('article, aside, main, nav, section'));
}

export function getImplicitRole(element) {
  const tag = tagName(element);
  switch (tag) {
    case 'a':
    case 'area':
      return element.hasAttribute('href') ? 'link' : null;
    case 'button':
      return 'button';
    case 'input': {
      const type = inputType(element);
      if (type === 'hidden') return null;
      if (type === 'search') return hasDatalist(element) ? 'combobox' : 'searchbox';
      if (['email', 'tel', 'text', 'url'].includes(type)) return hasDatalist(element) ? 'combobox' : 'textbox';
      return INPUT_TYPE_ROLES[type] || 'textbox';
    }
    case 'select':
      return element.multiple || Number(element.getAttribute('size')) > 1 ? 'listbox' : 'combobox';
    case 'textarea':
      return 'textbox';
    case 'option':
      return 'option';
    case 'optgroup':
    case 'fieldset':
    case 'details':
    case 'address':
      return 'group';
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
      return 'heading';
    case 'img':
      if (element.getAttribute('alt') === '' && !hasGlobalNameAttribute(element)) return 'presentation';
      return 'img';
    case 'svg':
      return 'img';
    case 'nav':
      return 'navigation';
    case 'main':
      return 'main';
    case 'aside':
      return 'complementary';
    case 'header':
      return isInsideSectioning(element) ? null : 'banner';
    case 'footer':
      return isInsideSectioning(element) ? null : 'contentinfo';
    case 'form':
      return 'form';
    case 'section':
      return hasGlobalNameAttribute(element) ? 'region' : null;
    case 'article':
      return 'article';
    case 'dialog':
      return 'dialog';
    case 'ul': case 'ol': case 'menu':
      return 'list';
    case 'li':
      return 'listitem';
    case 'table':
      return 'table';
    case 'tr':
      return 'row';
    case 'td':
      return element.closest('table')?.getAttribute('role') === 'grid' ? 'gridcell' : 'cell';
    case 'th':
      return element.getAttribute('scope') === 'row' ? 'rowheader' : 'columnheader';
    case 'thead': case 'tbody': case 'tfoot':
      return 'rowgroup';
    case 'progress':
      return 'progressbar';
    case 'meter':
      return 'meter';
    case 'output':
      return 'status';
    case 'hr':
      return 'separator';
    case 'figure':
      return 'figure';
    case 'p':
      return 'paragraph';
    case 'blockquote':
      return 'blockquote';
    case 'caption':
      return 'caption';
    case 'datalist':
      return 'listbox';
    case 'search':
      return 'search';
    case 'strong': case 'b':
      return 'strong';
    case 'em': case 'i':
      return 'emphasis';
    case 'code':
      return 'code';
    default:
      return null;
  }
}

export function getRole(element, cache) {
  if (cache?.roles.has(element)) return cache.roles.get(element);
  const role = getExplicitRole(element) ?? getImplicitRole(element);
  cache?.roles.set(element, role);
  return role;
}

function computedStyle(element) {
  try {
    return element.ownerDocument.defaultView?.getComputedStyle(element) ?? null;
  } catch {
    return null;
  }
}

/** Approximates Playwright's isElementHiddenForAria(). */
export function isHiddenForAccessibility(element, cache) {
  if (cache?.hidden.has(element)) return cache.hidden.get(element);
  const tag = tagName(element);
  if (tag === 'option' || tag === 'optgroup') {
    const select = element.closest('select, datalist');
    if (select) {
      const hidden = tagName(select) === 'select' ? isHiddenForAccessibility(select, cache) : false;
      cache?.hidden.set(element, hidden);
      return hidden;
    }
  }
  let hidden = false;
  if (element.closest('[aria-hidden="true"], [inert]')) {
    hidden = true;
  } else if (typeof element.checkVisibility === 'function') {
    if (!element.checkVisibility({ visibilityProperty: true })) {
      hidden = computedStyle(element)?.display !== 'contents';
    }
  } else {
    for (let node = element; node && node.nodeType === ELEMENT_NODE; node = node.parentElement) {
      if (node.hasAttribute('hidden') && node.getAttribute('hidden') !== 'until-found') { hidden = true; break; }
      if (SKIP_CONTENT_TAGS.has(tagName(node))) { hidden = true; break; }
      const style = computedStyle(node);
      if (style?.display === 'none') { hidden = true; break; }
      if (node === element && (style?.visibility === 'hidden' || style?.visibility === 'collapse')) {
        hidden = true;
        break;
      }
    }
  }
  cache?.hidden.set(element, hidden);
  return hidden;
}

function isBlock(element) {
  return BLOCK_TAGS.has(tagName(element));
}

function isEmbeddedControl(element, role) {
  return ['textbox', 'searchbox', 'combobox', 'listbox', 'slider', 'spinbutton'].includes(role) ||
    (tagName(element) === 'input' && !['button', 'submit', 'reset', 'image', 'checkbox', 'radio'].includes(inputType(element)));
}

/**
 * Value of embedded controls when they appear inside another element's name.
 * Text entry values are intentionally never read: they may contain user data.
 */
function embeddedControlText(element, role) {
  if (tagName(element) === 'select') {
    const option = element.selectedOptions?.[0];
    return option ? normalizeWhitespace(option.textContent) : '';
  }
  if (role === 'slider' || role === 'spinbutton') {
    return element.getAttribute('aria-valuetext') || element.getAttribute('aria-valuenow') || '';
  }
  return '';
}

function labelElementsFor(element) {
  if (!LABELABLE.has(tagName(element))) return [];
  if (tagName(element) === 'input' && inputType(element) === 'hidden') return [];
  if (element.labels) return Array.from(element.labels);
  const labels = [];
  const wrapping = element.closest('label');
  if (wrapping) labels.push(wrapping);
  if (element.id) {
    const doc = element.ownerDocument;
    for (const label of doc.querySelectorAll('label[for]')) {
      if (label.getAttribute('for') === element.id && !labels.includes(label)) labels.push(label);
    }
  }
  return labels;
}

function nativeTextAlternative(element, state, cache) {
  const tag = tagName(element);
  if (tag === 'input') {
    const type = inputType(element);
    if (type === 'button' || type === 'submit' || type === 'reset') {
      const value = element.getAttribute('value');
      if (value && value.trim()) return { text: value, source: 'value' };
      if (type === 'submit') return { text: 'Submit', source: 'default' };
      if (type === 'reset') return { text: 'Reset', source: 'default' };
      return null;
    }
    if (type === 'image') {
      const alt = element.getAttribute('alt') || element.getAttribute('value');
      if (alt && alt.trim()) return { text: alt, source: 'alt' };
    }
  }

  if (LABELABLE.has(tag)) {
    const labels = labelElementsFor(element);
    if (labels.length) {
      const text = labels
        .map((label) => computeTextAlternative(label, { ...state, recursing: true }, cache))
        .join(' ');
      if (normalizeWhitespace(text)) return { text, source: 'label' };
    }
  }

  if (tag === 'img' || tag === 'area' || (tag === 'input' && inputType(element) === 'image')) {
    const alt = element.getAttribute('alt');
    if (alt && alt.trim()) return { text: alt, source: 'alt' };
  }
  if (tag === 'svg') {
    const title = Array.from(element.children).find((child) => tagName(child) === 'title');
    if (title && normalizeWhitespace(title.textContent)) return { text: title.textContent, source: 'title' };
  }
  if (tag === 'fieldset') {
    const legend = Array.from(element.children).find((child) => tagName(child) === 'legend');
    if (legend) {
      const text = computeTextAlternative(legend, { ...state, recursing: true }, cache);
      if (normalizeWhitespace(text)) return { text, source: 'legend' };
    }
  }
  if (tag === 'table') {
    const caption = Array.from(element.children).find((child) => tagName(child) === 'caption');
    if (caption) {
      const text = computeTextAlternative(caption, { ...state, recursing: true }, cache);
      if (normalizeWhitespace(text)) return { text, source: 'caption' };
    }
  }
  if (tag === 'figure') {
    const caption = Array.from(element.children).find((child) => tagName(child) === 'figcaption');
    if (caption) {
      const text = computeTextAlternative(caption, { ...state, recursing: true }, cache);
      if (normalizeWhitespace(text)) return { text, source: 'caption' };
    }
  }
  return null;
}

function contentText(element, state, cache) {
  let result = '';
  for (const child of element.childNodes) {
    if (child.nodeType === TEXT_NODE) {
      result += child.textContent;
    } else if (child.nodeType === ELEMENT_NODE) {
      if (SKIP_CONTENT_TAGS.has(tagName(child))) continue;
      const text = computeTextAlternative(child, { ...state, recursing: true }, cache);
      if (tagName(child) === 'br') result += ' ';
      else result += isBlock(child) ? ` ${text} ` : text;
    }
  }
  return result;
}

function computeTextAlternative(node, state, cache) {
  if (node.nodeType === TEXT_NODE) return node.textContent;
  if (node.nodeType !== ELEMENT_NODE) return '';
  const element = node;
  if (state.visited.has(element)) return '';
  state.visited.add(element);

  if (!state.includeHidden && isHiddenForAccessibility(element, cache)) return '';

  const role = getRole(element, cache);
  const record = (source, text) => {
    if (!state.recursing && !state.source) state.source = source;
    return text;
  };

  if (!state.inLabelledBy) {
    const refs = getIdRefs(element, 'aria-labelledby');
    if (refs.length) {
      const text = refs
        .map((ref) =>
          computeTextAlternative(ref, {
            ...state,
            visited: state.visited,
            inLabelledBy: true,
            recursing: true,
            referenced: true,
            includeHidden: state.includeHidden || isHiddenForAccessibility(ref, cache),
          }, cache),
        )
        .join(' ');
      if (normalizeWhitespace(text)) return record('aria-labelledby', text);
    }
  }

  if (state.recursing && isEmbeddedControl(element, role)) {
    return embeddedControlText(element, role);
  }

  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) return record('aria-label', ariaLabel);

  if (role !== 'presentation' && role !== 'none') {
    const native = nativeTextAlternative(element, state, cache);
    if (native) return record(native.source, native.text);
  }

  if (NAME_FROM_CONTENT_ROLES.has(role) || state.recursing || state.referenced) {
    const text = contentText(element, state, cache);
    if (normalizeWhitespace(text)) return record('content', text);
  }

  const title = element.getAttribute('title');
  if (title && title.trim()) return record('title', title);

  if ((tagName(element) === 'input' || tagName(element) === 'textarea') && element.getAttribute('placeholder')?.trim()) {
    return record('placeholder', element.getAttribute('placeholder'));
  }
  return '';
}

/**
 * Estimated accessible name and the source it came from:
 * aria-labelledby | aria-label | label | value | default | alt | legend |
 * caption | content | title | placeholder | null
 */
export function getAccessibleName(element, cache) {
  if (cache?.names.has(element)) return cache.names.get(element);
  const state = { visited: new Set(), recursing: false, inLabelledBy: false, includeHidden: false, source: null };
  const name = normalizeWhitespace(computeTextAlternative(element, state, cache));
  const result = { name, source: name ? state.source : null };
  cache?.names.set(element, result);
  return result;
}

/** Normalised text of a <label>, ignoring nested form-control content. */
export function labelText(label) {
  let result = '';
  for (const child of label.childNodes) {
    if (child.nodeType === TEXT_NODE) result += child.textContent;
    else if (child.nodeType === ELEMENT_NODE) {
      const tag = tagName(child);
      if (['input', 'select', 'textarea', 'button', 'datalist', ...SKIP_CONTENT_TAGS].includes(tag)) continue;
      result += ` ${labelText(child)} `;
    }
  }
  return normalizeWhitespace(result);
}

/**
 * Labels as Playwright's getByLabel() sees them: <label> elements,
 * aria-labelledby targets and aria-label.
 */
export function getLabelTexts(element) {
  const texts = [];
  for (const label of labelElementsFor(element)) {
    texts.push({ text: normalizeWhitespace(label.textContent), clean: labelText(label), source: 'label' });
  }
  const refs = getIdRefs(element, 'aria-labelledby');
  if (refs.length) {
    const text = normalizeWhitespace(refs.map((ref) => ref.textContent).join(' '));
    if (text) texts.push({ text, clean: text, source: 'aria-labelledby' });
  }
  const ariaLabel = normalizeWhitespace(element.getAttribute('aria-label'));
  if (ariaLabel) texts.push({ text: ariaLabel, clean: ariaLabel, source: 'aria-label' });
  return texts.filter((entry) => entry.text);
}

export function getAssociatedLabelText(element) {
  const label = labelElementsFor(element)[0];
  return label ? labelText(label) : '';
}

export function allowsNameFromContent(role) {
  return NAME_FROM_CONTENT_ROLES.has(role);
}
