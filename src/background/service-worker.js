import { INSPECTOR_STATES, MESSAGE_TYPES } from '../shared/constants.js';
import { isTrustedSender, isValidMessage } from '../shared/messaging.js';
import { toggleInspector } from '../shared/tab-control.js';

const BADGES = {
  [INSPECTOR_STATES.INSPECTING]: { text: 'ON', color: '#4f46e5' },
  [INSPECTOR_STATES.SELECTED]: { text: '✓', color: '#059669' },
  [INSPECTOR_STATES.IDLE]: { text: '', color: '#4f46e5' },
};

async function setBadge(tabId, state) {
  const badge = BADGES[state] ?? BADGES[INSPECTOR_STATES.IDLE];
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: badge.color });
    await chrome.action.setBadgeText({ tabId, text: badge.text });
  } catch {
    // The tab may have closed between the message and this call.
  }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!isValidMessage(message) || !isTrustedSender(sender, chrome.runtime.id)) return false;
  const tabId = sender.tab?.id;
  if (message.type === MESSAGE_TYPES.INSPECTOR_STATUS_CHANGED && tabId !== undefined) {
    setBadge(tabId, message.payload.state);
  }
  return false;
});

// A navigation destroys the content script, so the badge must be reset.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') setBadge(tabId, INSPECTOR_STATES.IDLE);
});

// The keyboard shortcut grants activeTab just like clicking the toolbar icon.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'toggle-inspector' || !tab?.id) return;
  try {
    await toggleInspector(tab);
  } catch (error) {
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#dc2626' }).catch(() => {});
    await chrome.action.setBadgeText({ tabId: tab.id, text: '!' }).catch(() => {});
    await chrome.action.setTitle({ tabId: tab.id, title: `Smart Locator Inspector: ${error.message}` }).catch(() => {});
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: '' });
});
