import { analyzeElement, createQueryContext, resolveDescriptor } from '../engine/index.js';
import { getElementDetails, getParentElement, resolveInspectableTarget } from '../engine/dom-inspector.js';
import { HOVER_ANALYSIS_DELAY_MS, INSPECTOR_STATES, MESSAGE_TYPES } from '../shared/constants.js';
import { createMessage, isNoReceiverError, isValidMessage } from '../shared/messaging.js';
import { Overlay } from './overlay.js';

const INSTANCE_KEY = Symbol.for('smart-locator-inspector.instance');

/** Pointer events swallowed while inspecting so the page does not react. */
const BLOCKED_EVENTS = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick', 'auxclick', 'touchstart', 'touchend'];

function notify(type, payload = {}) {
  try {
    chrome.runtime.sendMessage(createMessage(type, payload)).catch((error) => {
      if (!isNoReceiverError(error)) console.debug('[Smart Locator Inspector]', error.message);
    });
  } catch {
    // The extension was reloaded or uninstalled; this orphaned script can no longer talk to it.
    instance?.stop({ silent: true });
  }
}

function createInspector() {
  let state = INSPECTOR_STATES.IDLE;
  let hovered = null;
  let selected = null;
  let lastResult = null;
  let hoverSummary = null;
  let descriptorsByKey = new Map();
  let pointerEvent = null;
  let frame = 0;
  let repositionFrame = 0;
  let hoverTimer = 0;
  let cursorSheet = null;

  const overlay = new Overlay({
    onStop: () => stop(),
    onParent: () => selectParent(),
  });

  function status() {
    return {
      state,
      hovered: hoverSummary,
      selection: lastResult,
    };
  }

  function emitStatus() {
    notify(MESSAGE_TYPES.INSPECTOR_STATUS_CHANGED, { state, hasSelection: Boolean(lastResult) });
  }

  function addCursorStyle() {
    try {
      cursorSheet = new CSSStyleSheet();
      cursorSheet.replaceSync('html, html * { cursor: crosshair !important; }');
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, cursorSheet];
    } catch {
      cursorSheet = null;
    }
  }

  function removeCursorStyle() {
    if (!cursorSheet) return;
    try {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => sheet !== cursorSheet);
    } catch {
      // Page replaced adoptedStyleSheets; nothing of ours remains attached.
    }
    cursorSheet = null;
  }

  function safeAnalyze(element) {
    try {
      return analyzeElement(element);
    } catch (error) {
      notify(MESSAGE_TYPES.INSPECTOR_ERROR, { message: `Could not analyze element: ${error.message}` });
      return null;
    }
  }

  function processPointer() {
    frame = 0;
    const event = pointerEvent;
    if (!event || state === INSPECTOR_STATES.IDLE) return;
    const target = resolveInspectableTarget(event.target);
    if (!target || target === hovered) return;
    hovered = target;
    const details = getElementDetails(target);
    overlay.showHover(target, details);
    clearTimeout(hoverTimer);
    if (state === INSPECTOR_STATES.INSPECTING) {
      hoverTimer = setTimeout(() => analyzeHover(target), HOVER_ANALYSIS_DELAY_MS);
    }
  }

  function analyzeHover(target) {
    if (target !== hovered || state !== INSPECTOR_STATES.INSPECTING) return;
    const analysis = safeAnalyze(target);
    if (!analysis || target !== hovered) return;
    const { result } = analysis;
    const best = (framework) => result.frameworks[framework].find((candidate) => candidate.validation.matchesTarget) ?? null;
    const playwright = best('playwright');
    const selenium = best('selenium');
    overlay.setHoverLocator(playwright?.code ?? null);
    hoverSummary = {
      details: result.details,
      best: {
        playwright: playwright && { code: playwright.code, rating: playwright.rating, ratingLabel: playwright.ratingLabel },
        selenium: selenium && { code: selenium.code, rating: selenium.rating, ratingLabel: selenium.ratingLabel },
      },
    };
    notify(MESSAGE_TYPES.ELEMENT_HOVERED, hoverSummary);
  }

  function onPointerMove(event) {
    if (overlay.containsEvent(event)) return;
    pointerEvent = event;
    if (!frame) frame = requestAnimationFrame(processPointer);
  }

  function onPointerLeave(event) {
    if (!event.relatedTarget) {
      hovered = null;
      overlay.hideHover();
    }
  }

  function onBlockedEvent(event) {
    if (overlay.containsEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (event.type === 'click' && event.button === 0) {
      const target = resolveInspectableTarget(event.target);
      if (target) select(target);
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      stop();
    } else if (event.key === 'Enter' && hovered && state === INSPECTOR_STATES.INSPECTING && !overlay.containsEvent(event)) {
      event.preventDefault();
      event.stopPropagation();
      select(hovered);
    }
  }

  function onViewportChange() {
    if (repositionFrame) return;
    repositionFrame = requestAnimationFrame(() => {
      repositionFrame = 0;
      overlay.reposition();
    });
  }

  function addListeners() {
    window.addEventListener('mousemove', onPointerMove, { capture: true, passive: true });
    document.addEventListener('mouseout', onPointerLeave, { capture: true, passive: true });
    for (const type of BLOCKED_EVENTS) window.addEventListener(type, onBlockedEvent, { capture: true, passive: false });
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onViewportChange, { capture: true, passive: true });
    window.addEventListener('resize', onViewportChange, { passive: true });
    window.addEventListener('pagehide', onPageHide);
  }

  function removeListeners() {
    window.removeEventListener('mousemove', onPointerMove, { capture: true });
    document.removeEventListener('mouseout', onPointerLeave, { capture: true });
    for (const type of BLOCKED_EVENTS) window.removeEventListener(type, onBlockedEvent, { capture: true });
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('scroll', onViewportChange, { capture: true });
    window.removeEventListener('resize', onViewportChange);
    window.removeEventListener('pagehide', onPageHide);
  }

  function onPageHide() {
    stop({ silent: true });
  }

  function start() {
    if (state === INSPECTOR_STATES.SELECTED) {
      overlay.hideSelection();
      state = INSPECTOR_STATES.INSPECTING;
      emitStatus();
      return status();
    }
    if (state !== INSPECTOR_STATES.IDLE) return status();
    overlay.mount();
    overlay.setInspecting(true);
    addListeners();
    addCursorStyle();
    state = INSPECTOR_STATES.INSPECTING;
    emitStatus();
    return status();
  }

  function select(element) {
    clearTimeout(hoverTimer);
    const analysis = safeAnalyze(element);
    if (!analysis) return;
    selected = element;
    lastResult = analysis.result;
    descriptorsByKey = analysis.descriptorsByKey;
    state = INSPECTOR_STATES.SELECTED;
    overlay.showSelection(element, lastResult);
    notify(MESSAGE_TYPES.ELEMENT_SELECTED, { result: lastResult });
    emitStatus();
  }

  function selectParent() {
    const parent = selected ? getParentElement(selected) : null;
    if (parent) select(parent);
    return status();
  }

  function stop({ silent = false } = {}) {
    const wasActive = state !== INSPECTOR_STATES.IDLE;
    removeListeners();
    cancelAnimationFrame(frame);
    cancelAnimationFrame(repositionFrame);
    clearTimeout(hoverTimer);
    frame = 0;
    repositionFrame = 0;
    pointerEvent = null;
    hovered = null;
    hoverSummary = null;
    overlay.unmount();
    removeCursorStyle();
    state = INSPECTOR_STATES.IDLE;
    if (wasActive && !silent) emitStatus();
    return status();
  }

  function highlight(candidateKey) {
    const descriptor = descriptorsByKey.get(candidateKey);
    if (!descriptor) return { ok: false, error: 'This locator is no longer available. Select the element again.' };
    let matches;
    try {
      matches = resolveDescriptor(descriptor, createQueryContext(document));
    } catch (error) {
      return { ok: false, error: error.message };
    }
    const temporary = !overlay.isMounted;
    overlay.mount();
    overlay.flashMatches(matches, selected);
    if (temporary) setTimeout(() => state === INSPECTOR_STATES.IDLE && overlay.unmount(), 2800);
    return { ok: true, matchCount: matches.length, includesSelected: matches.includes(selected) };
  }

  function handleMessage(message, sender, sendResponse) {
    if (!isValidMessage(message) || sender.id !== chrome.runtime.id) return false;
    switch (message.type) {
      case MESSAGE_TYPES.START_INSPECTOR:
        sendResponse(start());
        break;
      case MESSAGE_TYPES.STOP_INSPECTOR:
        sendResponse(stop());
        break;
      case MESSAGE_TYPES.GET_INSPECTOR_STATUS:
        sendResponse(status());
        break;
      case MESSAGE_TYPES.HIGHLIGHT_LOCATOR:
        sendResponse(highlight(String(message.payload.candidateKey ?? '')));
        break;
      case MESSAGE_TYPES.SELECT_PARENT:
        sendResponse(selectParent());
        break;
      default:
        return false;
    }
    return false;
  }

  chrome.runtime.onMessage.addListener(handleMessage);

  return { start, stop, status };
}

let instance = globalThis[INSTANCE_KEY];
if (!instance) {
  instance = createInspector();
  globalThis[INSTANCE_KEY] = instance;
}
