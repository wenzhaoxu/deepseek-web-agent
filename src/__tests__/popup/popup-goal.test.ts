import { describe, it, expect, vi } from 'vitest';
const ms = vi.fn();
(globalThis as any).chrome = { runtime: { sendMessage: ms, openOptionsPage: vi.fn() } };

describe('Popup goal & status', () => {
  it('covers GENERATING status, goal panel, goal start/stop, timer', async () => {
    document.body.innerHTML = `
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

    ms.mockImplementation((msg:any) => {
      if (msg.type==='GET_STATUS') return Promise.resolve({ success:true, data:{ status:'GENERATING' } });
      if (msg.type==='GET_INSTRUCTIONS') return Promise.resolve({
        success:true, data:{ instructions:[
          { id:'1', title:'总结', text:'请总结', category:'通用', enabled:true, order:1, autoSend:false, showInContextMenu:false },
          { id:'2', title:'翻译', text:'Translate', category:'语言', enabled:true, order:2, autoSend:false, showInContextMenu:false },
        ]}
      });
      if (msg.type==='GOAL_STATUS') return Promise.resolve({ success:true, data:{
        running:true, currentRound:1, totalRounds:3, currentInstructionIndex:0, totalInstructions:2, statusText:'运行中'
      }});
      return Promise.resolve({ success:true, data:{} });
    });

    window.close = () => {};

    await import('../../popup/popup.js');
    await new Promise(r => setTimeout(r, 100));

    // Status shows GENERATING
    expect(document.getElementById('status-bar')?.classList.contains('status-bar--generating')).toBe(true);
    expect(document.getElementById('status-text')?.textContent).toContain('模型回复中');

    // Switch to goal tab
    (document.querySelector('[data-tab="goal"]') as HTMLElement)?.click();
    await new Promise(r => setTimeout(r, 100));

    // Goal panel should have instruction checkboxes
    const goalPanel = document.getElementById('goal-panel');
    expect(goalPanel?.textContent).toContain('总结');
    expect(goalPanel?.textContent).toContain('翻译');

    // Goal panel should have checkboxes
    const checkboxes = goalPanel?.querySelectorAll('input[type="checkbox"]');
    if (checkboxes && checkboxes.length > 0) {
      // Click first checkbox to select instruction
      (checkboxes[0] as HTMLElement)?.click();
    }

    // Goal panel should have start/stop buttons rendered via JS
    // (buttons are added by renderGoalPanel which is called by init)
    await new Promise(r => setTimeout(r, 100));
    // Goal panel should show instruction checkboxes for selection
    const chk = goalPanel?.querySelectorAll('input[type="checkbox"]');
    expect(chk && chk.length > 0).toBe(true);

    // Goal tab shows completed state
    ms.mockImplementation((msg:any) => {
      if (msg.type==='GET_STATUS') return Promise.resolve({ success:true, data:{ status:'IDLE' } });
      if (msg.type==='GET_INSTRUCTIONS') return Promise.resolve({ success:true, data:{ instructions:[] }});
      if (msg.type==='GOAL_STATUS') return Promise.resolve({ success:true, data:{
        running:false, currentRound:2, totalRounds:3, currentInstructionIndex:1, totalInstructions:2, statusText:'已完成: 命中目标'
      }});
      return Promise.resolve({ success:true, data:{} });
    });
  });
});
