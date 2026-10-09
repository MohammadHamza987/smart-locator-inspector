import { FRAMEWORKS, FRAMEWORK_LABELS, OVERLAY_HOST_TAG } from '../shared/constants.js';
import styles from './inspector.css?inline';

const MAX_PANEL_CANDIDATES = 5;
const MAX_MATCH_BOXES = 50;
const MATCH_FLASH_MS = 2600;

/** Small DOM builder. Page-derived strings only ever go through textContent. */
function h(tag, props = {}, children = []) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'className') element.className = value;
    else if (key === 'text') element.textContent = value;
    else if (key.startsWith('on')) element.addEventListener(key.slice(2).toLowerCase(), value);
    else element.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}

function applyStyles(shadow) {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(styles);
    shadow.adoptedStyleSheets = [sheet];
  } catch {
    shadow.append(h('style', { text: styles }));
  }
}

function placeBox(box, rect) {
  box.style.display = 'block';
  box.style.left = `${rect.left}px`;
  box.style.top = `${rect.top}px`;
  box.style.width = `${Math.max(rect.width, 1)}px`;
  box.style.height = `${Math.max(rect.height, 1)}px`;
}

async function writeClipboard(text, shadow) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the selection-based fallback.
  }
  const area = h('textarea', { 'aria-hidden': 'true', readonly: true });
  area.value = text;
  area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
  shadow.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

/**
 * The in-page overlay lives in a closed shadow root attached to a custom host
 * element, so page CSS cannot restyle it and it never alters page elements.
 * The host is excluded from all locator queries.
 */
export class Overlay {
  constructor({ onStop, onParent } = {}) {
    this.onStop = onStop;
    this.onParent = onParent;
    this.framework = FRAMEWORKS.PLAYWRIGHT;
    this.dock = 'right';
    this.hoverTarget = null;
    this.selectedTarget = null;
    this.result = null;
    this.matchTimer = 0;
    this.toastTimer = 0;
    this.host = null;
  }

  get isMounted() {
    return Boolean(this.host?.isConnected);
  }

  mount() {
    if (this.host) {
      this.ensureAttached();
      return;
    }
    this.host = document.createElement(OVERLAY_HOST_TAG);
    this.host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    this.shadow = this.host.attachShadow({ mode: 'closed' });
    applyStyles(this.shadow);

    this.hoverBox = h('div', { className: 'box hover' });
    this.selectedBox = h('div', { className: 'box selected' });
    this.tagLabel = h('div', { className: 'tag-label' });
    this.matchLayer = h('div');
    this.tooltip = h('div', { className: 'tooltip', role: 'status' });
    this.panel = h('section', { className: 'panel', 'aria-label': 'Smart Locator Inspector results' });
    this.toastEl = h('div', { className: 'toast', role: 'status', 'aria-live': 'polite' });
    this.banner = h('div', { className: 'banner', role: 'status' }, [
      h('span', { className: 'dot' }),
      h('span', { text: 'Inspecting: hover and click an element.' }),
      h('kbd', { text: 'Esc' }),
      h('button', { className: 'btn danger', type: 'button', text: 'Stop', onClick: () => this.onStop?.() }),
    ]);

    this.layer = h('div', { className: 'layer' }, [
      this.matchLayer, this.hoverBox, this.selectedBox, this.tagLabel, this.tooltip, this.banner, this.panel, this.toastEl,
    ]);
    this.shadow.append(this.layer);
    this.ensureAttached();
  }

  ensureAttached() {
    if (this.host && !this.host.isConnected) {
      (document.documentElement || document.body).appendChild(this.host);
    }
  }

  unmount() {
    clearTimeout(this.matchTimer);
    clearTimeout(this.toastTimer);
    this.host?.remove();
    this.host = null;
    this.hoverTarget = null;
    this.selectedTarget = null;
    this.result = null;
  }

  containsEvent(event) {
    if (!this.host) return false;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    return event.target === this.host || path.includes(this.host);
  }

  setInspecting(active) {
    this.banner.classList.toggle('visible', active);
  }

  showHover(element, details) {
    this.ensureAttached();
    this.hoverTarget = element;
    this.renderTooltip(details);
    this.reposition();
  }

  hideHover() {
    this.hoverTarget = null;
    this.hoverBox.style.display = 'none';
    this.tagLabel.style.display = 'none';
    this.tooltip.style.display = 'none';
  }

  setHoverLocator(code, pending = false) {
    const line = this.tooltip.querySelector('.tooltip-locator');
    if (!line) return;
    line.textContent = code || 'No unique locator found';
    line.classList.toggle('pending', pending || !code);
    this.positionTooltip();
  }

  renderTooltip(details) {
    const rect = this.hoverTarget.getBoundingClientRect();
    const rows = [
      ['role', details.role && `${details.role}${details.accessibleName ? `  "${details.accessibleName}"` : ''}`],
      ['testid', details.testId && `${details.testId.name}="${details.testId.value}"`],
      ['name', details.name],
      ['label', details.label],
      ['aria-label', details.ariaLabel],
      ['placeholder', details.placeholder],
      ['type', details.tag === 'input' ? details.type : null],
      ['text', details.textPreview && `"${details.textPreview}"`],
    ].filter(([, value]) => value);

    const tagLine = [details.tag, details.id ? `#${details.id}` : '', details.classes.slice(0, 3).map((name) => `.${name}`).join('')].join('');
    this.tooltip.replaceChildren(...[
      h('div', { className: 'tooltip-head' }, [
        h('span', { className: 'tooltip-tag', text: tagLine }),
        h('span', { className: 'tooltip-size', text: `${Math.round(rect.width)}×${Math.round(rect.height)}` }),
      ]),
      rows.length ? h('div', { className: 'rows' }, rows.flatMap(([key, value]) => [
        h('span', { className: 'row-key', text: key }),
        h('span', { className: 'row-value', text: value }),
      ])) : null,
      details.sensitive ? h('div', { className: 'hint', text: 'Sensitive field: its value is never read.' }) : null,
      h('div', { className: 'tooltip-locator pending', text: 'Analyzing locators…' }),
      h('div', { className: 'hint' }, ['Click to select · ', h('kbd', { text: 'Esc' }), ' to stop']),
    ].filter(Boolean));
    this.tagLabel.textContent = tagLine;
  }

  showSelection(element, result) {
    this.ensureAttached();
    this.selectedTarget = element;
    this.result = result;
    this.tooltip.style.display = 'none';
    this.renderPanel();
    this.panel.classList.add('visible');
    this.reposition();
  }

  hideSelection() {
    this.selectedTarget = null;
    this.result = null;
    this.selectedBox.style.display = 'none';
    this.panel.classList.remove('visible');
  }

  renderPanel() {
    const result = this.result;
    const candidates = result.frameworks[this.framework].slice(0, MAX_PANEL_CANDIDATES);
    const toggle = h('div', { className: 'segmented', role: 'group', 'aria-label': 'Framework' },
      Object.values(FRAMEWORKS).map((framework) => h('button', {
        type: 'button',
        'aria-pressed': String(framework === this.framework),
        text: FRAMEWORK_LABELS[framework],
        onClick: () => {
          this.framework = framework;
          this.renderPanel();
        },
      })),
    );

    const list = candidates.length
      ? h('ul', { className: 'panel-list' }, candidates.map((candidate) => this.renderCandidate(candidate)))
      : h('div', { className: 'empty', text: 'No locator candidates could be generated for this element.' });

    this.panel.replaceChildren(
      h('header', { className: 'panel-header' }, [
        h('div', {}, [
          h('div', { className: 'brand', text: 'Smart Locator Inspector' }),
          h('div', { className: 'panel-element', text: `<${result.details.summary}>` }),
        ]),
        toggle,
      ]),
      list,
      h('footer', { className: 'panel-footer' }, [
        h('span', { className: 'hint', text: 'Click another element to inspect it.' }),
        h('div', { className: 'candidate-actions' }, [
          h('button', { className: 'btn', type: 'button', text: 'Parent', title: 'Select the parent element', onClick: () => this.onParent?.() }),
          h('button', {
            className: 'btn',
            type: 'button',
            text: this.dock === 'right' ? 'Dock left' : 'Dock right',
            onClick: () => {
              this.dock = this.dock === 'right' ? 'left' : 'right';
              this.panel.classList.toggle('dock-left', this.dock === 'left');
              this.renderPanel();
            },
          }),
          h('button', { className: 'btn danger', type: 'button', text: 'Stop', onClick: () => this.onStop?.() }),
        ]),
      ]),
    );
  }

  renderCandidate(candidate) {
    const { validation } = candidate;
    const matchText = validation.matchesTarget
      ? '1 match ✓'
      : validation.matchCount === null ? 'unverified' : `${validation.matchCount} matches`;
    return h('li', { className: `candidate ${candidate.rating}` }, [
      h('div', { className: 'candidate-meta' }, [
        h('span', { className: `badge ${candidate.rating}`, text: candidate.ratingLabel }),
        h('span', { className: 'chip', text: candidate.strategy }),
        h('span', { className: `chip ${validation.matchesTarget ? 'ok' : 'warn'}`, text: matchText }),
        h('span', { className: 'chip', text: `stability: ${candidate.stabilityLevel}` }),
      ]),
      h('code', { className: 'code', text: candidate.code }),
      h('div', { className: 'candidate-actions' }, [
        h('button', { className: 'btn primary', type: 'button', text: 'Copy', onClick: () => this.copy(candidate.code) }),
        h('button', { className: 'btn', type: 'button', text: 'Copy example', onClick: () => this.copy(candidate.example) }),
      ]),
    ]);
  }

  async copy(text) {
    const ok = await writeClipboard(text, this.shadow);
    this.toast(ok ? 'Copied to clipboard' : 'Copy failed: use the extension popup', !ok);
  }

  toast(message, isError = false) {
    clearTimeout(this.toastTimer);
    this.toastEl.textContent = message;
    this.toastEl.classList.toggle('error', isError);
    this.toastEl.classList.add('visible');
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('visible'), 1600);
  }

  flashMatches(elements, target) {
    this.ensureAttached();
    clearTimeout(this.matchTimer);
    this.matchLayer.replaceChildren(
      ...elements.slice(0, MAX_MATCH_BOXES).map((element, index) => {
        const box = h('div', { className: `box match${element === target ? ' is-target' : ''}` }, [
          h('span', { className: 'match-index', text: String(index + 1) }),
        ]);
        placeBox(box, element.getBoundingClientRect());
        return box;
      }),
    );
    if (elements[0]?.scrollIntoView && !isInViewport(elements[0])) {
      elements[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    this.matchTimer = setTimeout(() => this.matchLayer.replaceChildren(), MATCH_FLASH_MS);
  }

  reposition() {
    if (!this.host) return;
    if (this.hoverTarget?.isConnected) {
      const rect = this.hoverTarget.getBoundingClientRect();
      placeBox(this.hoverBox, rect);
      this.hoverBox.classList.toggle('subtle', Boolean(this.selectedTarget));
      this.tagLabel.style.display = this.selectedTarget ? 'block' : 'none';
      this.tagLabel.style.left = `${Math.max(0, rect.left)}px`;
      this.tagLabel.style.top = `${Math.max(0, rect.top - 20)}px`;
      if (!this.selectedTarget) this.positionTooltip();
    } else {
      this.hoverBox.style.display = 'none';
      this.tagLabel.style.display = 'none';
      this.tooltip.style.display = 'none';
    }
    if (this.selectedTarget?.isConnected) {
      placeBox(this.selectedBox, this.selectedTarget.getBoundingClientRect());
    } else {
      this.selectedBox.style.display = 'none';
    }
  }

  positionTooltip() {
    if (!this.hoverTarget?.isConnected || this.selectedTarget) return;
    const rect = this.hoverTarget.getBoundingClientRect();
    const tooltip = this.tooltip;
    tooltip.style.display = 'block';
    tooltip.style.visibility = 'hidden';
    const { width, height } = tooltip.getBoundingClientRect();
    const margin = 8;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    let top = rect.bottom + margin;
    if (top + height > viewportHeight - margin) top = rect.top - height - margin;
    if (top < margin) top = Math.min(viewportHeight - height - margin, Math.max(margin, rect.top + margin));
    const left = Math.min(Math.max(margin, rect.left), Math.max(margin, viewportWidth - width - margin));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(margin, top)}px`;
    tooltip.style.visibility = 'visible';
  }
}

function isInViewport(element) {
  const rect = element.getBoundingClientRect();
  return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
}
