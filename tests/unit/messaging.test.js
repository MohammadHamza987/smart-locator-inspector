import { describe, expect, it } from 'vitest';
import { MESSAGE_TYPES } from '../../src/shared/constants.js';
import {
  createMessage,
  describeChromeError,
  isNoReceiverError,
  isRestrictedUrl,
  isTrustedSender,
  isValidMessage,
} from '../../src/shared/messaging.js';

describe('message validation', () => {
  it('creates well-formed messages', () => {
    expect(createMessage(MESSAGE_TYPES.START_INSPECTOR)).toEqual({ source: 'smart-locator-inspector', type: 'START_INSPECTOR', payload: {} });
    expect(() => createMessage('NOPE')).toThrow();
  });

  it('rejects malformed messages', () => {
    expect(isValidMessage(createMessage(MESSAGE_TYPES.STOP_INSPECTOR))).toBe(true);
    expect(isValidMessage(null)).toBe(false);
    expect(isValidMessage({ type: 'START_INSPECTOR', payload: {} })).toBe(false);
    expect(isValidMessage({ source: 'smart-locator-inspector', type: 'EVIL', payload: {} })).toBe(false);
    expect(isValidMessage({ source: 'smart-locator-inspector', type: 'START_INSPECTOR', payload: [] })).toBe(false);
    expect(isValidMessage({ source: 'smart-locator-inspector', type: 'START_INSPECTOR' })).toBe(false);
  });

  it('only trusts senders from this extension', () => {
    expect(isTrustedSender({ id: 'abc' }, 'abc')).toBe(true);
    expect(isTrustedSender({ id: 'other' }, 'abc')).toBe(false);
    expect(isTrustedSender(undefined, 'abc')).toBe(false);
  });
});

describe('restricted pages', () => {
  it.each([
    'chrome://extensions', 'chrome-extension://abc/popup.html', 'edge://settings', 'about:blank',
    'view-source:https://a.com', 'https://chromewebstore.google.com/detail/x', 'https://chrome.google.com/webstore/x', 'devtools://devtools',
  ])('detects %s', (url) => {
    expect(isRestrictedUrl(url)).toBe(true);
  });

  it.each(['https://example.com', 'http://localhost:3000', 'file:///tmp/a.html'])('allows %s', (url) => {
    expect(isRestrictedUrl(url)).toBe(false);
  });
});

describe('error descriptions', () => {
  it('maps Chrome errors to actionable messages', () => {
    expect(describeChromeError(new Error('Cannot access a chrome:// URL')).code).toBe('restricted');
    expect(describeChromeError(new Error('The extensions gallery cannot be scripted.')).code).toBe('restricted');
    expect(describeChromeError(new Error('Cannot access contents of url "file:///a.html". Extension manifest must request permission')).code).toBe('permission');
    expect(describeChromeError(new Error('No tab with id: 5.')).code).toBe('tab-closed');
    expect(describeChromeError(new Error('Could not establish connection. Receiving end does not exist.')).code).toBe('no-receiver');
  });

  it('recognises missing receivers', () => {
    expect(isNoReceiverError(new Error('Could not establish connection. Receiving end does not exist.'))).toBe(true);
    expect(isNoReceiverError(new Error('boom'))).toBe(false);
  });
});
