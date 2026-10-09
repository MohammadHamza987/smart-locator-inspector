import { describe, expect, it } from 'vitest';
import { cssAttr, cssEscape, cssString, idSelector, javaString, jsString, xpathLiteral } from '../../src/engine/escape.js';

describe('xpathLiteral', () => {
  it('uses single quotes by default', () => {
    expect(xpathLiteral('Submit')).toBe("'Submit'");
  });

  it('switches to double quotes when the value contains a single quote', () => {
    expect(xpathLiteral("Don't stop")).toBe('"Don\'t stop"');
  });

  it('keeps single quotes when the value contains double quotes', () => {
    expect(xpathLiteral('Say "hi"')).toBe('\'Say "hi"\'');
  });

  it('uses concat() when both quote types are present', () => {
    expect(xpathLiteral(`It's "complicated"`)).toBe(`concat('It', "'", 's "complicated"')`);
  });

  it('handles leading, trailing and consecutive single quotes', () => {
    expect(xpathLiteral(`'a"''`)).toBe(`concat("'", 'a"', "'", "'")`);
  });

  it('produces literals that evaluate back to the original string', () => {
    const values = [`It's "complicated"`, `'"`, `"'"`, 'plain', `a''b"c`];
    for (const value of values) {
      const result = document.evaluate(`string(${xpathLiteral(value)})`, document, null, XPathResult.STRING_TYPE, null);
      expect(result.stringValue).toBe(value);
    }
  });
});

describe('cssEscape', () => {
  it('escapes a leading digit', () => {
    expect(cssEscape('1st-item')).toBe('\\31 st-item');
  });

  it('escapes punctuation used by frameworks', () => {
    expect(cssEscape(':r5:')).toBe('\\:r5\\:');
    expect(cssEscape('weird[name].field')).toBe('weird\\[name\\]\\.field');
  });

  it('escapes a lone hyphen and hyphen-digit prefixes', () => {
    expect(cssEscape('-')).toBe('\\-');
    expect(cssEscape('-1a')).toBe('-\\31 a');
  });

  it('leaves unicode untouched and produces selectors the DOM accepts', () => {
    expect(cssEscape('café')).toBe('café');
    document.body.innerHTML = '<div id="item:first.x"></div>';
    expect(document.querySelectorAll(`#${cssEscape('item:first.x')}`)).toHaveLength(1);
  });
});

describe('idSelector', () => {
  it('uses #id for ordinary ids', () => {
    expect(idSelector('login')).toBe('#login');
    expect(idSelector(':r5:')).toBe('#\\:r5\\:');
  });

  it('uses an attribute selector when a hex escape would be needed', () => {
    expect(idSelector('1st-item')).toBe('[id="1st-item"]');
  });
});

describe('cssString / cssAttr', () => {
  it('escapes quotes, backslashes and newlines', () => {
    expect(cssString('a"b\\c\nd')).toBe('"a\\"b\\\\c\\a d"');
  });

  it('builds attribute selectors that match the original value', () => {
    document.body.innerHTML = `<button title='Say "hello" \\ now'>x</button>`;
    const selector = `button${cssAttr('title', 'Say "hello" \\ now')}`;
    expect(document.querySelectorAll(selector)).toHaveLength(1);
  });
});

describe('jsString', () => {
  it('prefers single quotes', () => {
    expect(jsString('Login')).toBe("'Login'");
  });

  it('uses double quotes when only single quotes appear', () => {
    expect(jsString("Don't")).toBe('"Don\'t"');
  });

  it('escapes when both quote types appear', () => {
    expect(jsString(`It's "x"`)).toBe(`'It\\'s "x"'`);
  });

  it('escapes backslashes and control characters', () => {
    expect(jsString('a\\b\nc')).toBe("'a\\\\b\\nc'");
  });
});

describe('javaString', () => {
  it('always uses double quotes and escapes them', () => {
    expect(javaString(`//a[text()="x"]`)).toBe('"//a[text()=\\"x\\"]"');
  });

  it('escapes backslashes, newlines and tabs', () => {
    expect(javaString('#\\:r5\\:\n\t')).toBe('"#\\\\:r5\\\\:\\n\\t"');
  });
});
