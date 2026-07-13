import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendMessage = vi.fn();
(globalThis as any).chrome = {
  runtime: {
    sendMessage: mockSendMessage,
    openOptionsPage: vi.fn(),
  },
};

function setupPopupHTML() {
  document.body.innerHTML = `
    <div class="popup-container">
      <div class="tab-nav">
        <button class="tab-btn active" data-tab="commands">指令</button>
        <button class="tab-btn" data-tab="goal">目标</button>
      </div>
      <div id="commands-panel" class="panel">
        <div id="status-bar" class="status-bar status-bar--idle">
          <span id="status-icon">🟢</span>
          <span id="status-text">可输入</span>
        </div>
        <div class="search-box">
          <input type="search" id="search-input" placeholder="搜索指令...">
        </div>
        <div id="instruction-list" class="instruction-list"></div>
        <div id="toolbar" class="toolbar">
          <button id="open-deepseek">打开 DeepSeek</button>
          <button id="manage-instructions">管理指令</button>
        </div>
      </div>
      <div id="goal-panel" class="panel" style="display:none;"></div>
    </div>
  `;
}

describe('Popup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPopupHTML();
    mockSendMessage.mockImplementation((msg: any) => {
      if (msg.type === 'GET_STATUS') return Promise.resolve({ success: true, data: { status: 'IDLE' } });
      if (msg.type === 'GET_INSTRUCTIONS') return Promise.resolve({
        success: true,
        data: { instructions: [
          { id: '1', title: '总结内容', text: '请总结', category: '通用', enabled: true, order: 1, autoSend: false, showInContextMenu: false },
        ]},
      });
      return Promise.resolve({ success: true, data: {} });
    });
  });

  it('renders tabs and loads instructions', async () => {
    vi.resetModules();
    await import('../../popup/popup.js');
    await new Promise(r => setTimeout(r, 100));

    expect(document.querySelectorAll('.tab-btn').length).toBe(2);
    expect(document.getElementById('instruction-list')?.textContent).toContain('总结内容');
  });

  it('switches tabs', async () => {
    vi.resetModules();
    await import('../../popup/popup.js');
    await new Promise(r => setTimeout(r, 100));

    (document.querySelector('[data-tab="goal"]') as HTMLElement)?.click();
    expect(document.getElementById('commands-panel')?.style.display).toBe('none');
  });

  it('sends OPEN_DEEPSEEK on button click', async () => {
    vi.resetModules();
    await import('../../popup/popup.js');
    await new Promise(r => setTimeout(r, 100));

    document.getElementById('open-deepseek')?.click();
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'OPEN_DEEPSEEK' })
    );
  });
});
