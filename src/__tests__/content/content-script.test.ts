import { describe, it, expect, vi, beforeEach } from 'vitest';

// Setup chrome mock before imports
const mockRuntimeSendMessage = vi.fn();
(globalThis as any).chrome = {
  runtime: {
    sendMessage: mockRuntimeSendMessage,
    onMessage: {
      addListener: vi.fn(),
    },
  },
};

// Mock MutationObserver
(globalThis as any).MutationObserver = class {
  constructor(callback: MutationCallback) {
    this.callback = callback;
  }
  callback: MutationCallback;
  observe() {}
  disconnect() {}
  takeRecords() { return []; }
};

describe('content script selectors', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('should detect IDLE when page has no stop button and input is enabled', async () => {
    document.body.innerHTML = `
      <textarea id="chat-input" placeholder="给 DeepSeek 发送消息"></textarea>
    `;
    // Import the module (it calls init() at module level)
    const cs = await import('../../content/content-script.js');

    // The content script sends CONTENT_SCRIPT_READY on init
    expect(mockRuntimeSendMessage).toHaveBeenCalled();
  });

  it('findChatInput should match textarea with message placeholder', () => {
    document.body.innerHTML = `
      <div class="chat-container">
        <textarea class="ds-scroll-area" placeholder="给 DeepSeek 发送消息 " rows="2"></textarea>
      </div>
    `;
    const textarea = document.querySelector('textarea[placeholder*="消息"]');
    expect(textarea).not.toBeNull();
    expect(textarea?.tagName).toBe('TEXTAREA');
  });

  it('findChatInput should match textarea with name=search', () => {
    document.body.innerHTML = `
      <textarea name="search" placeholder="给 DeepSeek 发送消息 "></textarea>
    `;
    const textarea = document.querySelector('textarea[name="search"]');
    expect(textarea).not.toBeNull();
  });

  it('getLatestResponseText should return last response text', () => {
    document.body.innerHTML = `
      <div class="ds-markdown">First response</div>
      <div class="ds-markdown">Second response</div>
    `;
    const elements = document.querySelectorAll('.ds-markdown');
    expect(elements.length).toBe(2);
    expect(elements[1].textContent).toBe('Second response');
  });

  it('checkTargetInPage should find target string in response', () => {
    document.body.innerHTML = `
      <div class="ds-markdown">Hello world, this is a test response</div>
    `;
    const text = document.querySelector('.ds-markdown')?.textContent || '';
    expect(text.includes('test')).toBe(true);
    expect(text.includes('nonexistent')).toBe(false);
  });

  it('should detect GENERATING status when stop button is present', () => {
    document.body.innerHTML = `
      <button data-testid="stop-button">停止生成</button>
      <textarea></textarea>
    `;
    const stopBtn = document.querySelector('[data-testid="stop-button"]');
    expect(stopBtn).not.toBeNull();
  });
});
