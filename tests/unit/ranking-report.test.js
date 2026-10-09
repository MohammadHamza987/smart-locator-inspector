import { describe, it } from 'vitest';
import { analyzeElement } from '../../src/engine/index.js';
import * as pages from '../fixtures/pages.js';

const cases = [
  ['LOGIN_PAGE', '#login'],
  ['LOGIN_PAGE', '#email'],
  ['LOGIN_PAGE', 'input[type=checkbox]'],
  ['LOGIN_PAGE', 'a.link'],
  ['DUPLICATE_BUTTONS_PAGE', 'tbody tr:nth-child(2) button'],
  ['DUPLICATE_IDS_PAGE', 'button.secondary'],
  ['TEST_ID_PAGE', '[data-testid="cart-item-pear"] button'],
  ['DYNAMIC_PAGE', 'button'],
  ['ACCESSIBILITY_PAGE', 'button:nth-of-type(1)'],
];

describe.skipIf(!process.env.SMOKE)('smoke', () => {
  for (const [page, selector] of cases) {
    it(`${page} ${selector}`, () => {
      document.body.innerHTML = pages[page];
      const el = document.querySelector(selector);
      const { result } = analyzeElement(el);
      console.log(`\n=== ${page} ${selector}`);
      for (const fw of ['playwright', 'selenium']) {
        for (const c of result.frameworks[fw]) {
          console.log(`${fw.padEnd(10)} ${String(c.score).padStart(3)} ${c.rating.padEnd(11)} ${c.stabilityLevel.padEnd(6)} m=${c.validation.matchCount} ${c.code}${c.convertedFrom ? `   <= ${c.convertedFrom}` : ''}`);
        }
      }
    });
  }
});
