import { describe, it, expect, vi } from 'vitest';
const ms = vi.fn();
const ml = vi.fn();
(globalThis as any).chrome = { runtime: { sendMessage: ms, onMessage: { addListener: ml } } };
(globalThis as any).MutationObserver = class { observe = vi.fn(); disconnect = vi.fn(); };

describe('CS edge cases one shot', () => {
  it('covers all paths in a single import', async () => {
    ms.mockResolvedValue({ success: true });
    document.body.innerHTML = '<div>test response with keyword</div>';

    vi.resetModules();
    await import('../../content/content-script.js');
    await new Promise(r => setTimeout(r, 50));

    const listener = ml.mock.calls[0][0];

    // 1. GOAL_CHECK with ds-markdown present
    document.body.innerHTML = '<div class="ds-markdown">first response</div><div class="ds-markdown">latest with keyword</div>';
    // Re-trigger check by sending message to get fresh response
    let sr = vi.fn();
    listener({ type: 'GOAL_CHECK_TARGET', payload: { targetString: 'keyword' } }, null, sr);
    expect(sr).toHaveBeenCalled();
    let resp = sr.mock.calls[0][0];
    expect(resp.data.found).toBe(true);

    // 2. String NOT found
    sr = vi.fn();
    listener({ type: 'GOAL_CHECK_TARGET', payload: { targetString: '不存在的内容' } }, null, sr);
    resp = sr.mock.calls[0][0];
    expect(resp.data.found).toBe(false);

    // 3. FILL_TEXT with textarea present
    document.body.innerHTML = '<textarea placeholder="给 DeepSeek 发送消息"></textarea>';
    sr = vi.fn();
    listener({ type: 'FILL_TEXT', payload: { text: 'hello' } }, null, sr);
    await new Promise(r => setTimeout(r, 50));
    resp = sr.mock.calls[0][0];
    expect(resp.success).toBe(true);

    // 4. FILL_TEXT with no textarea → error
    document.body.innerHTML = '<div>no textarea</div>';
    sr = vi.fn();
    listener({ type: 'FILL_TEXT', payload: { text: 'test' } }, null, sr);
    await new Promise(r => setTimeout(r, 50));
    resp = sr.mock.calls[0][0];
    expect(resp.success).toBe(false);

    // 5. Unknown message type — no response
    sr = vi.fn();
    listener({ type: 'UNKNOWN_MESSAGE' }, null, sr);
    expect(sr).not.toHaveBeenCalled();
  });
});
