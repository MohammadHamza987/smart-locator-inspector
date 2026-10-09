import { FRAMEWORKS, MAX_CANDIDATES_PER_FRAMEWORK, RATING_LABELS, VALIDATION_STATUS } from '../shared/constants.js';
import {
  playwrightExample,
  playwrightLocator,
  playwrightStrategyLabel,
  supportsPlaywright,
} from '../generators/playwright-generator.js';
import {
  seleniumBy,
  seleniumExample,
  seleniumFindElement,
  seleniumStrategyLabel,
  supportsSelenium,
} from '../generators/selenium-java-generator.js';
import { descriptorKey, generateCandidates } from './candidate-generator.js';
import { getElementDetails } from './dom-inspector.js';
import { rankCandidates } from './ranker.js';
import { createQueryContext, validateDescriptor } from './validator.js';

const MAX_NON_UNIQUE = 3;

/** Which css/xpath "equivalent" mirrors a Playwright semantic candidate. */
function semanticEquivalent(candidate) {
  switch (candidate.kind) {
    case 'testid': return 'testid';
    case 'placeholder': return 'placeholder';
    case 'altText': return 'altText';
    case 'title': return 'title';
    case 'text': return 'text';
    case 'label': return candidate.traits.labelSource === 'aria-label' ? 'ariaLabel' : 'label';
    case 'role':
      return {
        content: 'text',
        'aria-label': 'ariaLabel',
        label: 'label',
        value: 'value',
        alt: 'altText',
        title: 'title',
        placeholder: 'placeholder',
      }[candidate.traits.nameSource] ?? null;
    default:
      return null;
  }
}

function dedupe(descriptors) {
  const seen = new Map();
  for (const descriptor of descriptors) {
    const key = descriptorKey(descriptor);
    if (!seen.has(key)) seen.set(key, descriptor);
  }
  return Array.from(seen.values());
}

function publicValidation(validation) {
  return {
    status: validation.status,
    matchCount: validation.matchCount,
    isUnique: validation.isUnique,
    matchesTarget: validation.matchesTarget,
    targetIndex: validation.targetIndex,
    error: validation.error,
  };
}

function limitList(ranked) {
  const usable = ranked.filter((candidate) => candidate.validation.matchesTarget);
  const rest = ranked.filter((candidate) => !candidate.validation.matchesTarget).slice(0, MAX_NON_UNIQUE);
  return [...usable, ...rest].slice(0, MAX_CANDIDATES_PER_FRAMEWORK);
}

function render(framework, candidate, index, details) {
  const base = {
    key: `${framework}:${index}`,
    descriptorKey: descriptorKey(candidate),
    framework,
    kind: candidate.kind,
    basis: candidate.basis,
    score: candidate.score,
    rating: candidate.rating,
    ratingLabel: RATING_LABELS[candidate.rating],
    stability: candidate.stability,
    stabilityLevel: candidate.stabilityLevel,
    explanation: candidate.explanation,
    warnings: candidate.warnings,
    validation: publicValidation(candidate.validation),
  };
  if (framework === FRAMEWORKS.PLAYWRIGHT) {
    return {
      ...base,
      strategy: playwrightStrategyLabel(candidate),
      code: playwrightLocator(candidate),
      example: playwrightExample(candidate, details),
    };
  }
  return {
    ...base,
    strategy: seleniumStrategyLabel(candidate),
    by: seleniumBy(candidate),
    code: seleniumFindElement(candidate),
    example: seleniumExample(candidate, details),
  };
}

/**
 * Inspects an element and returns serialisable, ranked locator candidates for
 * each framework. Runs entirely in the page's document; nothing leaves it.
 */
export function analyzeElement(element, { doc = element.ownerDocument } = {}) {
  const started = (globalThis.performance ?? Date).now();
  const ctx = createQueryContext(doc);
  const details = getElementDetails(element, ctx.a11y);
  const descriptors = dedupe(generateCandidates(element, ctx));

  const validated = descriptors
    .map((descriptor) => ({ ...descriptor, validation: validateDescriptor(descriptor, element, ctx) }))
    .filter((candidate) => candidate.validation.status !== VALIDATION_STATUS.VERIFIED || candidate.validation.targetIncluded);

  const playwright = limitList(rankCandidates(validated.filter((candidate) => candidate.frameworks.includes(FRAMEWORKS.PLAYWRIGHT) && supportsPlaywright(candidate))));
  const selenium = limitList(rankCandidates(validated.filter((candidate) => candidate.frameworks.includes(FRAMEWORKS.SELENIUM) && supportsSelenium(candidate))));

  const playwrightRendered = playwright.map((candidate, index) => render(FRAMEWORKS.PLAYWRIGHT, candidate, index, details));
  const seleniumRendered = selenium.map((candidate, index) => render(FRAMEWORKS.SELENIUM, candidate, index, details));

  // Explain how Playwright-only semantic locators translate to Selenium.
  playwright.forEach((candidate, index) => {
    const equivalent = semanticEquivalent(candidate);
    if (!equivalent || candidate.scope) return;
    const seleniumIndex = selenium.findIndex((item) => item.traits?.equivalent === equivalent && item.validation.matchesTarget);
    if (seleniumIndex === -1) return;
    const target = seleniumRendered[seleniumIndex];
    playwrightRendered[index].seleniumAlternative = target.code;
    target.convertedFrom ??= playwrightRendered[index].code;
  });

  const descriptorsByKey = new Map();
  for (const [list, rendered] of [[playwright, playwrightRendered], [selenium, seleniumRendered]]) {
    list.forEach((candidate, index) => descriptorsByKey.set(rendered[index].key, candidate));
  }

  const result = {
    details,
    frameworks: {
      [FRAMEWORKS.PLAYWRIGHT]: playwrightRendered,
      [FRAMEWORKS.SELENIUM]: seleniumRendered,
    },
    stats: {
      generated: descriptors.length,
      durationMs: Math.round((globalThis.performance ?? Date).now() - started),
    },
  };
  return { result, descriptorsByKey };
}

export { createQueryContext, resolveDescriptor, validateDescriptor } from './validator.js';
