import { describe, it, expect, vi } from 'vitest';
const ms = vi.fn();
(globalThis as any).chrome = { runtime: { sendMessage: ms, openOptionsPage: vi.fn() } };

describe('Popup one-shot', () => {
  it('covers all paths without closing doc', async () => {
    // Rebuild document properly
    document.documentElement.innerHTML = '';
    const html = `
    <div class="popup-container">
      <div class="tab-nav">
        <button class="tab-btn active" data-tab="commands">指令</button>
        <button class="tab-btn" data-tab="goal">目标</button>
      </div>
      <div id="commands-panel" class="panel">
        <div id="status-bar" class="status-bar status-bar--idle">
          <span id="status-icon">🟢</span><span id="status-text">可输入</span>
        </div>
        <div class="search-box"><input type="search" id="search-input" placeholder="搜索..."></div>
        <div id="instruction-list" class="instruction-list"></div>
        <div id="toolbar" class="toolbar">
          <button id="open-deepseek">打开</button>
          <button id="manage-instructions">管理</button>
        </div>
      </div>
      <div id="goal-panel" class="panel" style="display:none;"></div>
    </div>`;
    document.body.innerHTML = html;

    ms.mockImplementation((msg:any) => {
      if (msg.type==='GET_STATUS') return Promise.resolve({ success:true, data:{ status:'IDLE' } });
      if (msg.type==='GET_INSTRUCTIONS') return Promise.resolve({
        success:true, data:{ instructions:[
          { id:'1', title:'总结', text:'请总结', category:'通用', enabled:true, order:1, autoSend:false, showInContextMenu:false },
          { id:'2', title:'翻译', text:'Translate', category:'语言', enabled:true, order:2, autoSend:false, showInContextMenu:false },
        ]}
      });
      return Promise.resolve({ success:true, data:{} });
    });

    await import('../../popup/popup.js');
    await new Promise(r => setTimeout(r, 100));

    // Verify document is intact after module load
    expect(typeof document).toBe('object');
    expect(document.getElementById('status-text')?.textContent).toBe('可输入');

    // Instructions rendered
    const list = document.getElementById('instruction-list');
    expect(list?.querySelectorAll('.instruction-item').length).toBe(2);

    // Click instruction (window.close will be called, save ref)
    const origClose = window.close;
    window.close = () => {};
    ms.mockClear();
    (list?.querySelector('.instruction-item') as HTMLElement)?.click();
    expect(ms).toHaveBeenCalledWith(expect.objectContaining({ type:'EXECUTE_INSTRUCTION' }));

    // Search after click (document should still be intact)
    const search = document.getElementById('search-input') as HTMLInputElement;
    expect(search).not.toBeNull();
    search.value = '翻译';
    search.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 200));
    const filteredList = document.getElementById('instruction-list');
    expect(filteredList?.querySelectorAll('.instruction-item').length).toBe(1);

    // Tab switching
    const goalTab = document.querySelector('[data-tab="goal"]') as HTMLElement;
    expect(goalTab).not.toBeNull();
    goalTab?.click();
    expect(document.getElementById('commands-panel')?.style.display).toBe('none');
    expect(document.getElementById('goal-panel')?.style.display).not.toBe('none');

    // Open DeepSeek
    ms.mockClear();
    document.getElementById('open-deepseek')?.click();
    expect(ms).toHaveBeenCalledWith(expect.objectContaining({ type: 'OPEN_DEEPSEEK' }));

    // Manage instructions
    document.getElementById('manage-instructions')?.click();
    expect((globalThis as any).chrome.runtime.openOptionsPage).toHaveBeenCalled();

    window.close = origClose;
  });
});
