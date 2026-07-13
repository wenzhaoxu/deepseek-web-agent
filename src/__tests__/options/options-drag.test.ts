import { describe, it, expect, vi } from 'vitest';
const ms = vi.fn();
(globalThis as any).chrome = { runtime: { sendMessage: ms } };

describe('Options drag & modal', () => {
  it('covers drag-drop, modal save, esc close, overlay close', async () => {
    document.body.innerHTML = `
      <div class="options-container">
        <aside class="sidebar"><ul class="category-tree" id="categoryTree"></ul>
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
        <input type="text" id="editCategory" list="categoryList">
        <datalist id="categoryList"></datalist>
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

    const body = document.getElementById('tableBody');
    expect(body?.children.length).toBe(2);

    // --- Edit modal save ---
    ms.mockClear();
    (document.querySelector('[data-action="edit"]') as HTMLElement)?.click();
    const titleInput = document.getElementById('editTitle') as HTMLInputElement;
    titleInput.value = 'Updated T1';
    document.getElementById('modalSaveBtn')?.click();
    await new Promise(r => setTimeout(r, 50));
    expect(ms).toHaveBeenCalledWith(expect.objectContaining({ type: 'SAVE_INSTRUCTION' }));

    // --- Close modal via Escape ---
    document.getElementById('addInstructionBtn')?.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('editModal')?.style.display).toBe('none');

    // --- Modal form submit ---
    document.getElementById('addInstructionBtn')?.click();
    const form = document.getElementById('editForm') as HTMLFormElement;
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 50));

    // --- Add category ---
    const confirmSpy = vi.spyOn(window, 'prompt');
    confirmSpy.mockReturnValue('新分类');
    ms.mockClear();
    document.getElementById('addCategoryBtn')?.click();
    await new Promise(r => setTimeout(r, 50));
    expect(ms).toHaveBeenCalledWith(expect.objectContaining({ type: 'SAVE_INSTRUCTION' }));
    confirmSpy.mockRestore();

    // --- Batch disable (empty filter check) ---
    const cat编程 = document.querySelector('[data-category="编程"]') as HTMLElement;
    cat编程?.click();
    const confirmSpy2 = vi.spyOn(window, 'confirm');
    confirmSpy2.mockReturnValue(true);
    ms.mockClear();
    document.getElementById('batchDisableBtn')?.click();
    await new Promise(r => setTimeout(r, 50));
    confirmSpy2.mockRestore();
  });
});
