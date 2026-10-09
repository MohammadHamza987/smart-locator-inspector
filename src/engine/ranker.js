import { RATINGS, VALIDATION_STATUS } from '../shared/constants.js';

/**
 * Baseline preference by what a locator depends on. These are starting points
 * only: stability, uniqueness and structure adjust the final score, so a stable
 * test id can outrank a role whose name looks dynamic and vice versa.
 */
export const BASIS_SCORES = Object.freeze({
  testid: 96,
  role: 93,
  label: 90,
  id: 88,
  name: 84,
  ariaLabel: 82,
  altText: 80,
  placeholder: 78,
  linkText: 76,
  text: 74,
  value: 72,
  roleNameless: 70,
  title: 66,
  href: 64,
  attribute: 62,
  partialLinkText: 60,
  class: 50,
  structure: 30,
  absolute: 8,
});

const THRESHOLDS = { good: 78, acceptable: 55 };

const NAME_SOURCE_LABELS = {
  'aria-labelledby': 'aria-labelledby',
  'aria-label': 'aria-label',
  label: 'its <label>',
  value: 'its value attribute',
  default: 'the browser default',
  alt: 'its alt text',
  legend: 'its <legend>',
  caption: 'its caption',
  content: 'its visible text',
  title: 'its title attribute',
  placeholder: 'its placeholder',
};

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

/** Estimated resilience to UI and data changes, independent of uniqueness. */
export function estimateStability(candidate) {
  const traits = candidate.traits ?? {};
  let stability = traits.attributeStability ?? 0.6;
  if (traits.dynamicClass) stability = Math.min(stability, 0.2);
  if (traits.usesClasses) stability -= 0.05;
  stability -= 0.06 * (traits.depth ?? 0);
  if (traits.positional) stability -= 0.3;
  if (traits.absolute) stability = Math.min(stability, 0.05);
  return clamp(stability);
}

export function stabilityLevel(stability) {
  if (stability >= 0.75) return 'high';
  if (stability >= 0.5) return 'medium';
  return 'low';
}

function describeBasis(candidate) {
  const { basis, kind, value, options = {}, traits = {} } = candidate;
  switch (basis) {
    case 'testid':
      return 'Uses a dedicated test attribute, which exists specifically for automation.';
    case 'role': {
      const source = NAME_SOURCE_LABELS[traits.nameSource] ?? 'the accessibility tree';
      return `Matches the "${value}" role with the accessible name from ${source}, the way users and assistive tech perceive it.`;
    }
    case 'roleNameless':
      return `Matches the only visible "${value}" role on the page; it has no accessible name.`;
    case 'label':
      return 'Uses the form label text, which tends to survive markup refactors.';
    case 'id':
      return (traits.attributeStability ?? 0) >= 0.5
        ? 'Uses an id that looks hand-written and stable.'
        : 'Uses an id that looks auto-generated; it may change between builds or sessions.';
    case 'name':
      return 'Uses the name attribute, usually stable because form submission depends on it.';
    case 'ariaLabel':
      return 'Uses the aria-label attribute.';
    case 'altText':
      return 'Uses the image alt text.';
    case 'placeholder':
      return 'Uses placeholder text, which is visible but often reworded by designers.';
    case 'linkText':
      return 'Matches the exact visible link text.';
    case 'partialLinkText':
      return 'Matches part of the visible link text.';
    case 'text':
      return kind === 'text' ? 'Matches visible text.' : 'Matches the element by its visible text.';
    case 'value':
      return 'Uses the button value attribute.';
    case 'title':
      return 'Uses the title (tooltip) attribute.';
    case 'href':
      return 'Uses the link destination.';
    case 'attribute':
      return options.exact ? 'Combines attributes for uniqueness.' : 'Uses element attributes.';
    case 'class':
      return 'Relies on CSS class names, which change with styling refactors.';
    case 'structure':
      return 'Depends on DOM structure.';
    case 'absolute':
      return 'Absolute DOM path: breaks with almost any layout change. Use only as a last resort.';
    default:
      return '';
  }
}

function describeValidation(validation) {
  if (!validation) return 'Not validated.';
  if (validation.status === VALIDATION_STATUS.ERROR) return `Could not be evaluated: ${validation.error}`;
  if (validation.status === VALIDATION_STATUS.UNVERIFIED) return 'Could not be validated on this page.';
  if (validation.matchCount === 0) return 'Matches no elements on this page.';
  if (!validation.targetIncluded) return `Matches ${validation.matchCount} element(s), but not the selected one.`;
  if (validation.matchesTarget) return 'Matches exactly 1 element: the selected one.';
  return `Matches ${validation.matchCount} elements; the selected one is #${validation.targetIndex + 1}.`;
}

/** Scores one validated candidate. Pure function of its traits and validation. */
export function scoreCandidate(candidate) {
  const traits = candidate.traits ?? {};
  const validation = candidate.validation;
  const warnings = [];
  const stability = estimateStability(candidate);

  let score = BASIS_SCORES[candidate.basis] ?? 60;
  score *= 0.55 + 0.45 * stability;

  if (candidate.kind === 'xpath') score -= 4;
  if (traits.exact) score -= 2;
  if (traits.depth) {
    score -= 4 * traits.depth;
    warnings.push(traits.scoped ? 'Scoped to a container element.' : `Depends on ${traits.depth} ancestor level(s).`);
  }
  if (traits.positional) {
    score -= 20;
    warnings.push('Uses a positional index.');
  }
  if (traits.dynamicClass) warnings.push('Relies on class names that look generated.');
  if (traits.textBased && /\d/.test(candidate.options?.name ?? candidate.value ?? '')) {
    warnings.push('Text contains numbers, which often change with data.');
  }
  if (traits.partialText) warnings.push('Matches a text prefix because the full text is long.');
  if (traits.exact) warnings.push('Needs exact: true because a substring match is ambiguous.');
  if ((candidate.value?.length ?? 0) > 90) {
    score -= 8;
    warnings.push('Long selector; harder to read and maintain.');
  }
  if (candidate.basis === 'id' && (traits.attributeStability ?? 1) < 0.5) warnings.push('The id looks auto-generated.');

  let rating;
  if (!validation || validation.status === VALIDATION_STATUS.UNVERIFIED) {
    score *= 0.6;
    rating = RATINGS.UNVERIFIED;
  } else if (validation.status === VALIDATION_STATUS.ERROR) {
    score = 0;
    rating = RATINGS.UNVERIFIED;
  } else if (validation.matchCount === 0 || !validation.targetIncluded) {
    score = Math.min(score, 5);
    rating = RATINGS.FRAGILE;
  } else if (!validation.matchesTarget) {
    score = Math.min(score - 25 - 3 * Math.min(validation.matchCount, 8), 40);
    rating = RATINGS.FRAGILE;
  } else if (score >= THRESHOLDS.good) {
    rating = RATINGS.GOOD;
  } else if (score >= THRESHOLDS.acceptable) {
    rating = RATINGS.ACCEPTABLE;
  } else {
    rating = RATINGS.FRAGILE;
  }

  score = Math.round(clamp(score, 0, 100));
  return {
    score,
    rating,
    stability: Math.round(stability * 100) / 100,
    stabilityLevel: stabilityLevel(stability),
    explanation: [describeBasis(candidate), describeValidation(validation)].filter(Boolean).join(' '),
    warnings,
  };
}

const RATING_ORDER = {
  [RATINGS.RECOMMENDED]: 0,
  [RATINGS.GOOD]: 1,
  [RATINGS.ACCEPTABLE]: 2,
  [RATINGS.FRAGILE]: 3,
  [RATINGS.UNVERIFIED]: 4,
};

/**
 * Scores, sorts and promotes the best uniquely-matching candidate to
 * "Recommended". Candidates for one framework should be passed together.
 */
export function rankCandidates(candidates) {
  const scored = candidates.map((candidate) => ({ ...candidate, ...scoreCandidate(candidate) }));
  scored.sort((a, b) => {
    const usableA = a.validation?.matchesTarget ? 0 : 1;
    const usableB = b.validation?.matchesTarget ? 0 : 1;
    if (usableA !== usableB) return usableA - usableB;
    if (b.score !== a.score) return b.score - a.score;
    return RATING_ORDER[a.rating] - RATING_ORDER[b.rating];
  });
  const best = scored[0];
  if (best && best.validation?.matchesTarget && best.score >= THRESHOLDS.acceptable) {
    best.rating = RATINGS.RECOMMENDED;
  }
  return scored;
}
