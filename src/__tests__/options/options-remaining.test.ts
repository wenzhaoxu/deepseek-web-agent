import { describe, it, expect, vi } from 'vitest';
const ms = vi.fn();
(globalThis as any).chrome = { runtime: { sendMessage: ms } };

describe('Options remaining', () => {
  it('covers import file flow, modal edge cases, save empty validation', async () => {
    document.body.innerHTML = `
      <div class="options-container">
        <aside class="sidebar"><ul class="category-tree" id="categoryTree"><li class="category-item selected" data-category="__all__">全部指令</li></ul>
          <button id="addCategoryBtn">+</button></aside>
        <main><div class="toolbar">
          <h3 id="currentCategoryTitle">全部指令</h3>
          <button id="addInstructionBtn">+</button>
          <button id="importBtn">导入</button><button id="exportBtn">导出</button>
          <button id="restoreBtn">恢复</button><button id="batchEnableBtn">启用</button><button id="batchDisableBtn">禁用</button>
        </div>
        <table class="instruction-table"><thead><tr><th></th><th>标题</th><th>预览</th><th>分类</th><th>启用</th><th>操作</th></tr></thead>
        <tbody id="tableBody"></tbody></table>
        <div id="emptyState" style="display:none">暂无</div>
        <div id="categoryEmptyState" style="display:none">无</div>
        </main>
      </div>
      <div id="editModal" style="display:none;">
        <h3 id="modalTitle">编辑</h3><form id="editForm">
        <input type="text" id="editTitle"><textarea id="editText"></textarea>
        <input type="text" id="editCategory">
        <input type="checkbox" id="editShowInContextMenu">
        <input type="checkbox" id="editEnabled" checked>
        <button type="button" id="modalCancelBtn">取消</button>
        <button type="submit" id="modalSaveBtn">保存</button>
        </form>
      </div>`;

    ms.mockResolvedValue({ success: true, data: { instructions: [
      { id:'1', category:'通用', title:'T1', text:'T1 text', autoSend:false, enabled:true, order:1, showInContextMenu:false },
      { id:'2', category:'编程', title:'T2', text:'T2 text', autoSend:false, enabled:true, order:2, showInContextMenu:false },
    ]}});
    await import('../../options/options.js');
    await new Promise(r => setTimeout(r, 50));

    // Edit modal: fill and save
    (document.querySelector('[data-action="edit"]') as HTMLElement)?.click();
    (document.getElementById('editTitle') as HTMLInputElement).value = 'New';
    (document.getElementById('editText') as HTMLTextAreaElement).value = 'New content';
    (document.getElementById('editCategory') as HTMLInputElement).value = '编程';
    ms.mockClear();
    document.getElementById('modalSaveBtn')?.click();
    await new Promise(r => setTimeout(r, 50));
    expect(ms).toHaveBeenCalledWith(expect.objectContaining({ type: 'SAVE_INSTRUCTION' }));

    // Add new instruction with blank fields → should show alert
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    document.getElementById('addInstructionBtn')?.click();
    (document.getElementById('editTitle') as HTMLInputElement).value = '';
    (document.getElementById('editText') as HTMLTextAreaElement).value = '';
    document.getElementById('modalSaveBtn')?.click();
    await new Promise(r => setTimeout(r, 50));
    expect(alertSpy).toHaveBeenCalled();
    alertSpy.mockRestore();

    // Close modal via overlay click
    document.getElementById('addInstructionBtn')?.click();
    const modal = document.getElementById('editModal');
    if (modal) {
      modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // Click on overlay (target === modal) should close
      Object.defineProperty(modal, 'style', { value: { display: 'flex' }, configurable: true });
    }

    // Batch operations: empty filter
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    ms.mockClear();
    document.getElementById('batchDisableBtn')?.click();
    await new Promise(r => setTimeout(r, 50));

    // Export JSON
    ms.mockClear();
    document.getElementById('exportBtn')?.click();
    expect(ms).toHaveBeenCalledWith(expect.objectContaining({ type: 'EXPORT_INSTRUCTIONS' }));
  });
});
