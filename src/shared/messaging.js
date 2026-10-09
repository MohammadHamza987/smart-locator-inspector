import { MESSAGE_TYPES, RESTRICTED_URL_PATTERNS } from './constants.js';

const KNOWN_TYPES = new Set(Object.values(MESSAGE_TYPES));
export const MESSAGE_SOURCE = 'smart-locator-inspector';

export function createMessage(type, payload = {}) {
  if (!KNOWN_TYPES.has(type)) {
    throw new Error(`Unknown message type: ${type}`);
  }
  return { source: MESSAGE_SOURCE, type, payload };
}

export function isValidMessage(message) {
  return (
    message !== null &&
    typeof message === 'object' &&
    message.source === MESSAGE_SOURCE &&
    typeof message.type === 'string' &&
    KNOWN_TYPES.has(message.type) &&
    message.payload !== null &&
    typeof message.payload === 'object' &&
    !Array.isArray(message.payload)
  );
}

/**
 * Messages from extension pages or our own content scripts only.
 * Web pages cannot use chrome.runtime.sendMessage to reach us without
 * externally_connectable, but checking the sender id keeps the contract explicit.
 */
export function isTrustedSender(sender, extensionId) {
  return Boolean(sender) && sender.id === extensionId;
}

export function isRestrictedUrl(url) {
  if (!url) return false;
  return RESTRICTED_URL_PATTERNS.some((pattern) => pattern.test(url));
}

export function isFileUrl(url) {
  return typeof url === 'string' && /^file:/i.test(url);
}

const NO_RECEIVER_PATTERNS = [
  /receiving end does not exist/i,
  /could not establish connection/i,
  /message port closed/i,
  /no tab with id/i,
];

export function isNoReceiverError(error) {
  const text = String(error?.message ?? error ?? '');
  return NO_RECEIVER_PATTERNS.some((pattern) => pattern.test(text));
}

/** Maps raw Chrome API errors to wording a user can act on. */
export function describeChromeError(error) {
  const text = String(error?.message ?? error ?? 'Unknown error');
  if (/cannot access a chrome:\/\/ url|cannot access contents of url "chrome|extensions gallery cannot be scripted|cannot be scripted due to an extensionssettings policy|chrome-extension:\/\//i.test(text)) {
    return {
      code: 'restricted',
      message: 'Chrome does not allow extensions to inspect this page (browser pages, the Web Store and other extensions are protected).',
    };
  }
  if (/file:\/\//i.test(text) || /cannot access contents of the page/i.test(text)) {
    return {
      code: 'permission',
      message: 'Chrome blocked access to this page. For local files, enable "Allow access to file URLs" for this extension in chrome://extensions.',
    };
  }
  if (/missing host permission|activeTab/i.test(text)) {
    return {
      code: 'permission',
      message: 'Permission for this tab has expired. Click the extension icon again to grant temporary access.',
    };
  }
  if (/no tab with id|tab was closed/i.test(text)) {
    return { code: 'tab-closed', message: 'The tab was closed or is no longer available.' };
  }
  if (/frame with id 0 was removed|frame was removed|navigat/i.test(text)) {
    return { code: 'navigated', message: 'The page navigated while starting the inspector. Try again.' };
  }
  if (isNoReceiverError(error)) {
    return { code: 'no-receiver', message: 'The inspector is not running on this page.' };
  }
  return { code: 'unknown', message: text };
}

export async function sendToTab(tabId, type, payload = {}) {
  return chrome.tabs.sendMessage(tabId, createMessage(type, payload));
}

/** Fire-and-forget runtime message; silently ignores "no listener" errors. */
export async function sendRuntime(type, payload = {}) {
  try {
    return await chrome.runtime.sendMessage(createMessage(type, payload));
  } catch (error) {
    if (!isNoReceiverError(error)) throw error;
    return undefined;
  }
}
