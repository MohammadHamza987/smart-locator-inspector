export const EXTENSION_NAME = 'Smart Locator Inspector';

export const MESSAGE_TYPES = Object.freeze({
  START_INSPECTOR: 'START_INSPECTOR',
  STOP_INSPECTOR: 'STOP_INSPECTOR',
  GET_INSPECTOR_STATUS: 'GET_INSPECTOR_STATUS',
  HIGHLIGHT_LOCATOR: 'HIGHLIGHT_LOCATOR',
  SELECT_PARENT: 'SELECT_PARENT',
  ELEMENT_HOVERED: 'ELEMENT_HOVERED',
  ELEMENT_SELECTED: 'ELEMENT_SELECTED',
  INSPECTOR_STATUS_CHANGED: 'INSPECTOR_STATUS_CHANGED',
  INSPECTOR_ERROR: 'INSPECTOR_ERROR',
});

export const INSPECTOR_STATES = Object.freeze({
  IDLE: 'idle',
  INSPECTING: 'inspecting',
  SELECTED: 'selected',
});

export const FRAMEWORKS = Object.freeze({
  PLAYWRIGHT: 'playwright',
  SELENIUM: 'selenium',
});

export const FRAMEWORK_LABELS = Object.freeze({
  [FRAMEWORKS.PLAYWRIGHT]: 'Playwright JS',
  [FRAMEWORKS.SELENIUM]: 'Selenium Java',
});

export const RATINGS = Object.freeze({
  RECOMMENDED: 'recommended',
  GOOD: 'good',
  ACCEPTABLE: 'acceptable',
  FRAGILE: 'fragile',
  UNVERIFIED: 'unverified',
});

export const RATING_LABELS = Object.freeze({
  [RATINGS.RECOMMENDED]: 'Recommended',
  [RATINGS.GOOD]: 'Good',
  [RATINGS.ACCEPTABLE]: 'Acceptable',
  [RATINGS.FRAGILE]: 'Fragile',
  [RATINGS.UNVERIFIED]: 'Unverified',
});

export const VALIDATION_STATUS = Object.freeze({
  VERIFIED: 'verified',
  UNVERIFIED: 'unverified',
  ERROR: 'error',
});

/** Attributes commonly reserved for test automation, in preference order. */
export const TEST_ID_ATTRIBUTES = Object.freeze([
  'data-testid',
  'data-test-id',
  'data-test',
  'data-qa',
  'data-cy',
  'data-automation-id',
  'data-e2e',
]);

/** Attribute used by Playwright's default getByTestId(). */
export const PLAYWRIGHT_TEST_ID_ATTRIBUTE = 'data-testid';

export const CONTENT_SCRIPT_FILE = 'content/content.js';

/** Host element for the in-page overlay. Kept out of every locator query. */
export const OVERLAY_HOST_TAG = 'smart-locator-inspector-overlay';

export const MAX_CANDIDATES_PER_FRAMEWORK = 10;
export const MAX_TEXT_LENGTH = 80;
export const HOVER_ANALYSIS_DELAY_MS = 140;

export const RESTRICTED_URL_PATTERNS = Object.freeze([
  /^chrome:/i,
  /^chrome-extension:/i,
  /^chrome-untrusted:/i,
  /^chrome-search:/i,
  /^devtools:/i,
  /^edge:/i,
  /^brave:/i,
  /^opera:/i,
  /^vivaldi:/i,
  /^about:/i,
  /^view-source:/i,
  /^data:/i,
  /^blob:/i,
  /^javascript:/i,
  /^https:\/\/chromewebstore\.google\.com\//i,
  /^https:\/\/chrome\.google\.com\/webstore/i,
  /^https:\/\/microsoftedge\.microsoft\.com\/addons/i,
]);

export const DOCS_URL = 'https://github.com/MohammadHamza987/smart-locator-inspector#readme';
