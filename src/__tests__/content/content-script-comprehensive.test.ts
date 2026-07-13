import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendMessage = vi.fn();
const mockAddListener = vi.fn();
(globalThis as any).chrome = {
  runtime: { sendMessage: mockSendMessage, onMessage: { addListener: mockAddListener } },
};
(globalThis as any).MutationObserver = class {
  observe = vi.fn();
  disconnect = vi.fn();
};

describe('Content Script comprehensive', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    mockSendMessage.mockResolvedValue({ success: true });
    vi.resetModules();
    await import('../../content/content-script.js');
  });

  it('getLatestResponseText uses ds-markdown selector', () => {
    document.body.innerHTML = '<div class="ds-markdown">test response</div>';
    const listener = mockAddListener.mock.calls[0][0];
    const sendResponse = vi.fn();
    listener({ type: 'GOAL_CHECK_TARGET', payload: { targetString: 'test' } }, null, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ found: true })
      })
    );
  });

  it('getLatestResponseText fallback to body.innerText', () => {
    document.body.innerHTML = 'plain body text content';
    const listener = mockAddListener.mock.calls[0][0];
    const sendResponse = vi.fn();
    listener({ type: 'GOAL_CHECK_TARGET', payload: { targetString: 'plain' } }, null, sendResponse);
    expect(sendResponse).toHaveBeenCalled();
  });

  it('getLatestResponseText returns not found when no content', () => {
    document.body.innerHTML = '';
    const listener = mockAddListener.mock.calls[0][0];
    const sendResponse = vi.fn();
    listener({ type: 'GOAL_CHECK_TARGET', payload: { targetString: 'anything' } }, null, sendResponse);
    const resp = sendResponse.mock.calls[0][0];
    expect(resp.success).toBe(true);
    expect(resp.data.found).toBe(false);
  });

  it('FILL_TEXT with input present returns success', () => {
    document.body.innerHTML = '<textarea placeholder="给 DeepSeek 发送消息"></textarea>';
    const listener = mockAddListener.mock.calls[0][0];
    const sendResponse = vi.fn();
    listener({ type: 'FILL_TEXT', payload: { text: 'Hello World' } }, null, sendResponse);

    return new Promise(r => setTimeout(r, 50)).then(() => {
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  it('FILL_TEXT without input returns error', () => {
    const listener = mockAddListener.mock.calls[0][0];
    const sendResponse = vi.fn();
    listener({ type: 'FILL_TEXT', payload: { text: 'test' } }, null, sendResponse);

    return new Promise(r => setTimeout(r, 50)).then(() => {
      const resp = sendResponse.mock.calls[0][0];
      expect(resp.success).toBe(false);
      expect(resp.error).toBe('未找到输入框');
    });
  });

  it('ignores unknown message types', () => {
    const listener = mockAddListener.mock.calls[0][0];
    const sendResponse = vi.fn();
    listener({ type: 'UNKNOWN_TYPE' }, null, sendResponse);
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
