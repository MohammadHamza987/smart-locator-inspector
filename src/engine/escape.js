/**
 * CSS.escape() per CSSOM spec. Implemented locally because it is missing in
 * some test environments and must behave identically everywhere.
 */
export function cssEscape(value) {
  const string = String(value);
  const length = string.length;
  let result = '';
  const firstCodeUnit = string.charCodeAt(0);

  if (length === 1 && firstCodeUnit === 0x002d) {
    return '\\' + string;
  }

  for (let index = 0; index < length; index++) {
    const codeUnit = string.charCodeAt(index);
    if (codeUnit === 0x0000) {
      result += '\uFFFD';
      continue;
    }
    if (
      (codeUnit >= 0x0001 && codeUnit <= 0x001f) ||
      codeUnit === 0x007f ||
      (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
      (index === 1 && codeUnit >= 0x0030 && codeUnit <= 0x0039 && firstCodeUnit === 0x002d)
    ) {
      result += '\\' + codeUnit.toString(16) + ' ';
      continue;
    }
    if (
      codeUnit >= 0x0080 ||
      codeUnit === 0x002d ||
      codeUnit === 0x005f ||
      (codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
      (codeUnit >= 0x0041 && codeUnit <= 0x005a) ||
      (codeUnit >= 0x0061 && codeUnit <= 0x007a)
    ) {
      result += string.charAt(index);
      continue;
    }
    result += '\\' + string.charAt(index);
  }
  return result;
}

/** Double-quoted CSS string literal for attribute selectors. */
export function cssString(value) {
  const escaped = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r\n|\r|\n/g, '\\a ')
    .replace(/\f/g, '\\c ')
    .replace(/\0/g, '\uFFFD');
  return `"${escaped}"`;
}

/** CSS attribute selector, e.g. [data-testid="login"]. */
export function cssAttr(name, value) {
  return `[${cssEscape(name)}=${cssString(value)}]`;
}

/** #id, or [id="…"] when the id would need hard-to-read hex escapes (e.g. a leading digit). */
export function idSelector(id) {
  const escaped = cssEscape(id);
  return /\\[0-9a-f]+ /i.test(escaped) ? cssAttr('id', id) : `#${escaped}`;
}

/**
 * XPath 1.0 string literal. XPath has no escape sequences, so values that
 * contain both quote types must be assembled with concat().
 */
export function xpathLiteral(value) {
  const string = String(value);
  if (!string.includes("'")) return `'${string}'`;
  if (!string.includes('"')) return `"${string}"`;
  const parts = string.split("'");
  const pieces = [];
  parts.forEach((part, index) => {
    if (part) pieces.push(`'${part}'`);
    if (index < parts.length - 1) pieces.push(`"'"`);
  });
  return `concat(${pieces.join(', ')})`;
}

/** JavaScript string literal, preferring single quotes like Playwright docs. */
export function jsString(value) {
  const string = String(value);
  const quote = string.includes("'") && !string.includes('"') ? '"' : "'";
  let result = '';
  for (const char of string) {
    switch (char) {
      case '\\': result += '\\\\'; break;
      case '\n': result += '\\n'; break;
      case '\r': result += '\\r'; break;
      case '\t': result += '\\t'; break;
      case '\u2028': result += '\\u2028'; break;
      case '\u2029': result += '\\u2029'; break;
      default:
        if (char === quote) result += '\\' + char;
        else if (char < ' ') result += '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0');
        else result += char;
    }
  }
  return quote + result + quote;
}

/** Java string literal (always double quoted). */
export function javaString(value) {
  let result = '';
  for (const char of String(value)) {
    switch (char) {
      case '\\': result += '\\\\'; break;
      case '"': result += '\\"'; break;
      case '\n': result += '\\n'; break;
      case '\r': result += '\\r'; break;
      case '\t': result += '\\t'; break;
      case '\b': result += '\\b'; break;
      case '\f': result += '\\f'; break;
      default:
        if (char < ' ') result += '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0');
        else result += char;
    }
  }
  return `"${result}"`;
}

export function normalizeWhitespace(value) {
  return String(value ?? '').replace(/[\s\u00a0\u200b]+/g, ' ').trim();
}

export function truncate(value, max) {
  const string = String(value ?? '');
  return string.length > max ? string.slice(0, Math.max(0, max - 1)).trimEnd() + '…' : string;
}
