import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { INSPECTOR_STATES, MESSAGE_TYPES } from '../../shared/constants.js';
import { describeChromeError, isFileUrl, isRestrictedUrl, isValidMessage } from '../../shared/messaging.js';
import {
  getInspectorStatus,
  highlightLocator,
  selectParent as selectParentInTab,
  startInspector,
  stopInspector,
} from '../../shared/tab-control.js';

/** Popup state is derived from the content script; nothing is persisted. */
export function useInspector() {
  const tab = shallowRef(null);
  const state = ref('loading');
  const hovered = shallowRef(null);
  const selection = shallowRef(null);
  const message = ref(null);
  const busy = ref(false);
  const unavailable = ref(false);

  const isActive = computed(() => state.value === INSPECTOR_STATES.INSPECTING || state.value === INSPECTOR_STATES.SELECTED);

  function showError(error) {
    const { code, message: text } = error?.code ? { code: error.code, message: error.message } : describeChromeError(error);
    message.value = { type: 'error', text };
    if (code === 'restricted' || code === 'tab-closed') unavailable.value = true;
  }

  async function resolveTab() {
    // ?tabId= lets automated tests open the popup as a page. Access still
    // depends on activeTab/host permissions, so it grants nothing extra.
    const tabId = Number(new URLSearchParams(location.search).get('tabId'));
    if (Number.isInteger(tabId) && tabId > 0) return chrome.tabs.get(tabId);
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    return active ?? null;
  }

  function applyStatus(status) {
    if (!status) return;
    state.value = status.state;
    if (status.selection) selection.value = status.selection;
    hovered.value = status.hovered ?? null;
  }

  async function init() {
    try {
      tab.value = await resolveTab();
      if (!tab.value?.id) {
        unavailable.value = true;
        state.value = INSPECTOR_STATES.IDLE;
        message.value = { type: 'error', text: 'No active tab found.' };
        return;
      }
      if (isRestrictedUrl(tab.value.url)) {
        unavailable.value = true;
        state.value = INSPECTOR_STATES.IDLE;
        message.value = { type: 'warning', text: describeChromeError(new Error('Cannot access a chrome:// URL')).message };
        return;
      }
      if (isFileUrl(tab.value.url)) {
        message.value = { type: 'info', text: 'Local file: enable "Allow access to file URLs" for this extension in chrome://extensions if starting fails.' };
      }
      const status = await getInspectorStatus(tab.value.id);
      state.value = INSPECTOR_STATES.IDLE;
      applyStatus(status);
    } catch (error) {
      state.value = INSPECTOR_STATES.IDLE;
      showError(error);
    }
  }

  async function run(action) {
    if (!tab.value?.id || busy.value) return undefined;
    busy.value = true;
    message.value = null;
    try {
      return await action();
    } catch (error) {
      showError(error);
      return undefined;
    } finally {
      busy.value = false;
    }
  }

  const start = () => run(async () => applyStatus(await startInspector(tab.value)));

  const stop = () => run(async () => {
    const status = await stopInspector(tab.value.id);
    state.value = status?.state ?? INSPECTOR_STATES.IDLE;
    hovered.value = null;
  });

  const selectParent = () => run(async () => applyStatus(await selectParentInTab(tab.value.id)));

  const highlight = (candidate) => run(async () => {
    const response = await highlightLocator(tab.value.id, candidate);
    if (!response?.ok) {
      message.value = { type: 'warning', text: response?.error ?? 'Could not highlight matches.' };
    } else {
      const count = response.matchCount;
      message.value = {
        type: count === 1 && response.includesSelected ? 'success' : 'info',
        text: `Highlighted ${count} match${count === 1 ? '' : 'es'} on the page right now.`,
      };
    }
  });

  function onRuntimeMessage(msg, sender) {
    if (!isValidMessage(msg) || sender.id !== chrome.runtime.id) return false;
    if (!tab.value || sender.tab?.id !== tab.value.id) return false;
    switch (msg.type) {
      case MESSAGE_TYPES.ELEMENT_HOVERED:
        hovered.value = msg.payload;
        break;
      case MESSAGE_TYPES.ELEMENT_SELECTED:
        selection.value = msg.payload.result;
        state.value = INSPECTOR_STATES.SELECTED;
        break;
      case MESSAGE_TYPES.INSPECTOR_STATUS_CHANGED:
        state.value = msg.payload.state;
        if (msg.payload.state === INSPECTOR_STATES.IDLE) hovered.value = null;
        break;
      case MESSAGE_TYPES.INSPECTOR_ERROR:
        message.value = { type: 'error', text: String(msg.payload.message ?? 'Inspector error') };
        break;
      default:
        break;
    }
    return false;
  }

  function onTabUpdated(tabId, changeInfo) {
    if (tabId !== tab.value?.id || changeInfo.status !== 'loading') return;
    if (state.value !== 'loading' && (isActive.value || selection.value)) {
      message.value = { type: 'info', text: 'The page reloaded or navigated, so inspection stopped. Start again to continue.' };
    }
    state.value = INSPECTOR_STATES.IDLE;
    hovered.value = null;
    selection.value = null;
  }

  function onTabRemoved(tabId) {
    if (tabId !== tab.value?.id) return;
    unavailable.value = true;
    state.value = INSPECTOR_STATES.IDLE;
    message.value = { type: 'error', text: 'The inspected tab was closed.' };
  }

  onMounted(() => {
    chrome.runtime.onMessage.addListener(onRuntimeMessage);
    chrome.tabs.onUpdated.addListener(onTabUpdated);
    chrome.tabs.onRemoved.addListener(onTabRemoved);
    init();
  });

  onBeforeUnmount(() => {
    chrome.runtime.onMessage.removeListener(onRuntimeMessage);
    chrome.tabs.onUpdated.removeListener(onTabUpdated);
    chrome.tabs.onRemoved.removeListener(onTabRemoved);
  });

  return {
    tab,
    state,
    hovered,
    selection,
    message,
    busy,
    unavailable,
    isActive,
    start,
    stop,
    selectParent,
    highlight,
    dismissMessage: () => { message.value = null; },
  };
}
