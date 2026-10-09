import { CONTENT_SCRIPT_FILE, MESSAGE_TYPES } from './constants.js';
import { describeChromeError, isNoReceiverError, isRestrictedUrl, sendToTab } from './messaging.js';

export class InspectorError extends Error {
  constructor({ code, message }) {
    super(message);
    this.code = code;
  }
}

/** Returns the inspector status, or null when the content script is not present. */
export async function getInspectorStatus(tabId) {
  try {
    return (await sendToTab(tabId, MESSAGE_TYPES.GET_INSPECTOR_STATUS)) ?? null;
  } catch (error) {
    if (isNoReceiverError(error)) return null;
    throw new InspectorError(describeChromeError(error));
  }
}

/**
 * Injects the content script once. The script itself also guards against
 * double execution, so a race between popup and keyboard shortcut is harmless.
 */
export async function ensureInjected(tab) {
  if (isRestrictedUrl(tab.url)) {
    throw new InspectorError(describeChromeError(new Error('Cannot access a chrome:// URL')));
  }
  const status = await getInspectorStatus(tab.id);
  if (status) return status;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [CONTENT_SCRIPT_FILE],
    });
  } catch (error) {
    throw new InspectorError(describeChromeError(error));
  }
  return null;
}

async function sendCommand(tabId, type, payload) {
  try {
    return await sendToTab(tabId, type, payload);
  } catch (error) {
    throw new InspectorError(describeChromeError(error));
  }
}

export async function startInspector(tab) {
  await ensureInjected(tab);
  return sendCommand(tab.id, MESSAGE_TYPES.START_INSPECTOR);
}

export async function stopInspector(tabId) {
  try {
    return await sendToTab(tabId, MESSAGE_TYPES.STOP_INSPECTOR);
  } catch (error) {
    if (isNoReceiverError(error)) return null;
    throw new InspectorError(describeChromeError(error));
  }
}

export async function toggleInspector(tab) {
  const status = await getInspectorStatus(tab.id);
  if (status && status.state !== 'idle') {
    return stopInspector(tab.id);
  }
  return startInspector(tab);
}

export function highlightLocator(tabId, candidate) {
  return sendCommand(tabId, MESSAGE_TYPES.HIGHLIGHT_LOCATOR, { candidateKey: candidate.key });
}

export function selectParent(tabId) {
  return sendCommand(tabId, MESSAGE_TYPES.SELECT_PARENT);
}
