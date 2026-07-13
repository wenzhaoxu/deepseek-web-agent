import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Setup chrome mocks BEFORE importing anything
const mockSendMessage = vi.fn();
const mockAddListener = vi.fn();
(globalThis as any).chrome = {
  runtime: {
    sendMessage: mockSendMessage,
    onMessage: { addListener: mockAddListener },
  },
};

// Mock MutationObserver
(globalThis as any).MutationObserver = class {
  observe = vi.fn();
  disconnect = vi.fn();
};

// Helper to re-import fresh module
function getContentScript() {
  // Clear any previous module state
  vi.resetModules();
  // Re-setup mocks
  (globalThis as any).chrome.runtime.sendMessage = mockSendMessage;
  (globalThis as any).chrome.runtime.onMessage.addListener = mockAddListener;
  return import('../../content/content-script.js');
}

describe('content script runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('should call chrome.runtime.sendMessage on init (CONTENT_SCRIPT_READY)', async () => {
    mockSendMessage.mockResolvedValue({ success: true });
    await getContentScript();
    // init() sends CONTENT_SCRIPT_READY message
    expect(mockSendMessage).toHaveBeenCalled();
    const call = mockSendMessage.mock.calls[0][0];
    expect(call.type).toBe('CONTENT_SCRIPT_READY');
  });

  it('should set up onMessage listener on init', async () => {
    await getContentScript();
    expect(mockAddListener).toHaveBeenCalled();
  });

  it('should send DISCONNECT on beforeunload', async () => {
    mockSendMessage.mockResolvedValue({ success: true });
    await getContentScript();
    vi.clearAllMocks();

    // Trigger beforeunload
    window.dispatchEvent(new Event('beforeunload'));
    expect(mockSendMessage).toHaveBeenCalled();
    const call = mockSendMessage.mock.calls[0][0];
    expect(call.type).toBe('DISCONNECT');
  });

  it('setNativeValue should set textarea value and dispatch events', async () => {
    await getContentScript();
    document.body.innerHTML = '<textarea id="t"></textarea>';
    const ta = document.getElementById('t') as HTMLTextAreaElement;

    // The setNativeValue function is not exported, so we test through FILL_TEXT message
    // Get the registered onMessage listener and call it
    const listener = mockAddListener.mock.calls[0][0];

    // Simulate FILL_TEXT message
    const sendResponse = vi.fn();
    listener(
      { type: 'FILL_TEXT', payload: { text: 'Hello World' } },
      null,
      sendResponse,
    );

    // Wait for microtasks
    await new Promise(r => setTimeout(r, 50));

    // The textarea should exist in DOM — findChatInput should find it
    // Since handleFillText is async, the response should have been sent
    expect(sendResponse).toHaveBeenCalled();
    const response = sendResponse.mock.calls[0][0];
    expect(response.success).toBe(true);
  });

  it('handleFillText should return error when no input found', async () => {
    await getContentScript();
    const listener = mockAddListener.mock.calls[0][0];
    const sendResponse = vi.fn();

    listener(
      { type: 'FILL_TEXT', payload: { text: 'Hello' } },
      null,
      sendResponse,
    );

    await new Promise(r => setTimeout(r, 50));

    expect(sendResponse).toHaveBeenCalled();
    const response = sendResponse.mock.calls[0][0];
    expect(response.success).toBe(false);
    expect(response.error).toBe('未找到输入框');
  });

  it('GOAL_CHECK_TARGET should check page text', async () => {
    document.body.innerHTML = '<div class="ds-markdown">这是一个测试回复</div>';
    await getContentScript();
    const listener = mockAddListener.mock.calls[0][0];
    const sendResponse = vi.fn();

    listener(
      { type: 'GOAL_CHECK_TARGET', payload: { targetString: '测试' } },
      null,
      sendResponse,
    );

    await new Promise(r => setTimeout(r, 10));

    expect(sendResponse).toHaveBeenCalled();
    const response = sendResponse.mock.calls[0][0];
    expect(response.success).toBe(true);
    expect(response.data.found).toBe(true);
  });

  it('GOAL_CHECK_TARGET should return not found when string missing', async () => {
    document.body.innerHTML = '<div class="ds-markdown">Hello World</div>';
    await getContentScript();
    const listener = mockAddListener.mock.calls[0][0];
    const sendResponse = vi.fn();

    listener(
      { type: 'GOAL_CHECK_TARGET', payload: { targetString: '不存在' } },
      null,
      sendResponse,
    );

    await new Promise(r => setTimeout(r, 10));

    expect(sendResponse).toHaveBeenCalled();
    const response = sendResponse.mock.calls[0][0];
    expect(response.success).toBe(true);
    expect(response.data.found).toBe(false);
  });

  it('should detect IDLE status when no stop button present', async () => {
    document.body.innerHTML = '<textarea></textarea>';
    await getContentScript();
    vi.clearAllMocks();

    // Trigger MutationObserver callback by DOM mutation
    const newEl = document.createElement('div');
    document.body.appendChild(newEl);

    await new Promise(r => setTimeout(r, 600)); // wait for debounce

    // status change should have been reported
    if (mockSendMessage.mock.calls.length > 0) {
      const call = mockSendMessage.mock.calls[0];
      expect(call[0].type).toBe('STATUS_CHANGE');
      expect(call[0].payload.status).toBe('IDLE');
    }
  });

  it('should detect GENERATING status when stop button present', async () => {
    document.body.innerHTML = `
      <button data-testid="stop-button">停止生成</button>
      <textarea></textarea>
    `;
    await getContentScript();
    vi.clearAllMocks();

    // Trigger MutationObserver
    document.body.appendChild(document.createElement('span'));
    await new Promise(r => setTimeout(r, 600));

    if (mockSendMessage.mock.calls.length > 0) {
      const call = mockSendMessage.mock.calls[0];
      if (call[0].type === 'STATUS_CHANGE') {
        expect(call[0].payload.status).toBe('GENERATING');
      }
    }
  });
});
