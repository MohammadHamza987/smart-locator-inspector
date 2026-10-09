import { javaString } from '../engine/escape.js';

export const SELENIUM_STRATEGY_LABELS = Object.freeze({
  id: 'By.id',
  name: 'By.name',
  css: 'By.cssSelector',
  xpath: 'By.xpath',
  className: 'By.className',
  linkText: 'By.linkText',
  partialLinkText: 'By.partialLinkText',
});

const BY_METHODS = {
  id: 'id',
  name: 'name',
  css: 'cssSelector',
  xpath: 'xpath',
  className: 'className',
  linkText: 'linkText',
  partialLinkText: 'partialLinkText',
};

const JAVA_RESERVED = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
  'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float',
  'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native',
  'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
  'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void',
  'volatile', 'while', 'true', 'false', 'null', 'var', 'record', 'yield',
]);

/** Selenium has no chained/semantic locators; only plain By strategies are supported. */
export function supportsSelenium(descriptor) {
  return Boolean(BY_METHODS[descriptor.kind]) && !descriptor.scope && !descriptor.filter;
}

/** By expression, e.g. By.id("login"). */
export function seleniumBy(descriptor) {
  const method = BY_METHODS[descriptor.kind];
  if (!method || descriptor.scope) {
    throw new Error(`Selenium Java has no direct equivalent for locator kind "${descriptor.kind}"`);
  }
  if (descriptor.kind === 'className' && /\s/.test(descriptor.value)) {
    throw new Error('By.className() does not accept compound class names');
  }
  return `By.${method}(${javaString(descriptor.value)})`;
}

export function seleniumFindElement(descriptor) {
  return `driver.findElement(${seleniumBy(descriptor)})`;
}

const KIND_SUFFIX = {
  'text-input': 'Input',
  checkbox: 'Checkbox',
  radio: 'Radio',
  select: 'Select',
  file: 'FileInput',
  button: 'Button',
  link: 'Link',
};

/** Builds a readable, valid Java identifier such as loginButton. */
export function javaVariableName(details = {}) {
  const suffix = KIND_SUFFIX[details.kind] ?? 'Element';
  const source = details.testId?.value || details.id || details.name || details.accessibleName || details.label || '';
  const words = String(source)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((word) => word.toLowerCase());
  if (words.length && words[words.length - 1] === suffix.toLowerCase()) words.pop();
  let name = words.map((word, index) => (index === 0 ? word : word[0].toUpperCase() + word.slice(1))).join('');
  name = name ? name + suffix : suffix.toLowerCase() === 'element' ? 'element' : suffix[0].toLowerCase() + suffix.slice(1);
  if (/^\d/.test(name)) name = `el${name[0].toUpperCase()}${name.slice(1)}`;
  if (JAVA_RESERVED.has(name)) name = `${name}Element`;
  return name;
}

/** Complete Java usage example; requires org.openqa.selenium.By and WebElement imports. */
export function seleniumExample(descriptor, details = {}) {
  const variable = javaVariableName(details);
  const lines = [`WebElement ${variable} = ${seleniumFindElement(descriptor)};`];
  switch (details.kind) {
    case 'text-input':
      lines.push(`${variable}.clear();`, `${variable}.sendKeys(${javaString(details.sensitive ? 'secret' : 'text')});`);
      break;
    case 'checkbox':
    case 'radio':
      lines.push(`if (!${variable}.isSelected()) {`, `    ${variable}.click();`, '}');
      break;
    case 'select':
      lines.push(`new Select(${variable}).selectByVisibleText(${javaString('Option')});`);
      break;
    case 'file':
      lines.push(`${variable}.sendKeys(${javaString('/path/to/file')});`);
      break;
    default:
      lines.push(`${variable}.click();`);
  }
  const imports = ['org.openqa.selenium.By', 'org.openqa.selenium.WebElement'];
  if (details.kind === 'select') imports.push('org.openqa.selenium.support.ui.Select');
  return `// Requires: ${imports.map((path) => `import ${path};`).join(' ')}\n${lines.join('\n')}`;
}

export function seleniumStrategyLabel(descriptor) {
  return SELENIUM_STRATEGY_LABELS[descriptor.kind] ?? descriptor.kind;
}
