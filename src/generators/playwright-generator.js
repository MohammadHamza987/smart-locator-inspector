import { jsString } from '../engine/escape.js';

export const PLAYWRIGHT_STRATEGY_LABELS = Object.freeze({
  role: 'getByRole',
  label: 'getByLabel',
  placeholder: 'getByPlaceholder',
  testid: 'getByTestId',
  text: 'getByText',
  altText: 'getByAltText',
  title: 'getByTitle',
  css: 'CSS',
  xpath: 'XPath',
});

export const PLAYWRIGHT_KINDS = new Set(Object.keys(PLAYWRIGHT_STRATEGY_LABELS));

function optionsLiteral(entries) {
  const parts = entries.filter(([, value]) => value !== undefined && value !== false).map(([key, value]) =>
    `${key}: ${typeof value === 'string' ? jsString(value) : String(value)}`,
  );
  return parts.length ? `{ ${parts.join(', ')} }` : '';
}

function exactArg(options) {
  return options?.exact ? ', { exact: true }' : '';
}

function stepCall(descriptor) {
  const { kind, value, options = {} } = descriptor;
  switch (kind) {
    case 'role': {
      const opts = optionsLiteral([['name', options.name], ['exact', options.name !== undefined && options.exact ? true : undefined]]);
      return `getByRole(${jsString(value)}${opts ? `, ${opts}` : ''})`;
    }
    case 'label':
      return `getByLabel(${jsString(value)}${exactArg(options)})`;
    case 'placeholder':
      return `getByPlaceholder(${jsString(value)}${exactArg(options)})`;
    case 'testid':
      return `getByTestId(${jsString(value)})`;
    case 'text':
      return `getByText(${jsString(value)}${exactArg(options)})`;
    case 'altText':
      return `getByAltText(${jsString(value)}${exactArg(options)})`;
    case 'title':
      return `getByTitle(${jsString(value)}${exactArg(options)})`;
    case 'css':
      return `locator(${jsString(value)})`;
    case 'xpath':
      return `locator(${jsString(`xpath=${value}`)})`;
    default:
      throw new Error(`Playwright does not support locator kind "${kind}"`);
  }
}

function filterCall(descriptor) {
  return descriptor.filter?.hasText ? `.filter({ hasText: ${jsString(descriptor.filter.hasText)} })` : '';
}

/** Playwright locator expression, e.g. page.getByRole('button', { name: 'Login' }). */
export function playwrightLocator(descriptor, root = 'page') {
  const parent = descriptor.scope ? playwrightLocator(descriptor.scope, root) : root;
  return `${parent}.${stepCall(descriptor)}${filterCall(descriptor)}`;
}

export function supportsPlaywright(descriptor) {
  if (!PLAYWRIGHT_KINDS.has(descriptor.kind)) return false;
  return descriptor.scope ? supportsPlaywright(descriptor.scope) : true;
}

const ACTIONS = {
  'text-input': (sensitive) => `fill(${jsString(sensitive ? 'secret' : 'text')})`,
  checkbox: () => 'check()',
  radio: () => 'check()',
  select: () => `selectOption(${jsString('option-value')})`,
  file: () => `setInputFiles(${jsString('path/to/file')})`,
};

/** A separate, executable usage example. The locator itself never embeds an action. */
export function playwrightExample(descriptor, details = {}) {
  const locator = playwrightLocator(descriptor);
  const action = ACTIONS[details.kind]?.(details.sensitive) ?? 'click()';
  return `await ${locator}.${action};`;
}

export function playwrightStrategyLabel(descriptor) {
  const label = PLAYWRIGHT_STRATEGY_LABELS[descriptor.kind] ?? descriptor.kind;
  return descriptor.scope ? `${label} (scoped)` : label;
}
