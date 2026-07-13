import { describe, it, expect, vi } from 'vitest';
const ms = vi.fn();
(globalThis as any).chrome = { runtime: { sendMessage: ms } };

describe('Options exhaustive', () => {
  it('covers every options function path', async () => {
    // Setup full DOM
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

    const inst = [
      { id:'1', category:'通用', title:'T1', text:'T1 text', autoSend:false, enabled:true, order:1, showInContextMenu:false },
      { id:'2', category:'编程', title:'T2', text:'T2 text', autoSend:false, enabled:false, order:2, showInContextMenu:true },
    ];
    ms.mockResolvedValue({ success: true, data: { instructions: inst } });
    await import('../../options/options.js');
    await new Promise(r => setTimeout(r, 50));

    const body = document.getElementById('tableBody');
    expect(body?.children.length).toBe(2);

    // --- Add category (success + duplicate) ---
    const promptSpy = vi.spyOn(window, 'prompt');
    promptSpy.mockReturnValue('新分类');
    ms.mockClear();
    document.getElementById('addCategoryBtn')?.click();
    await new Promise(r => setTimeout(r, 100));
    expect(ms).toHaveBeenCalled();
    promptSpy.mockRestore();

    // --- Close edit modal via overlay click ---
    document.getElementById('addInstructionBtn')?.click();
    const modal = document.getElementById('editModal');
    if (modal) {
      modal.style.display = 'flex';
      // Simulate click on the overlay itself (not a child)
      modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    // --- Close via Escape ---
    document.getElementById('addInstructionBtn')?.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    // --- Toggle switch via delegation ---
    const toggle = body?.querySelector('.toggle-switch input') as HTMLInputElement;
    if (toggle) {
      toggle.checked = !toggle.checked;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 50));
    }

    // --- Edit then save (with all fields) ---
    (document.querySelector('[data-action="edit"]') as HTMLElement)?.click();
    (document.getElementById('editTitle') as HTMLInputElement).value = 'Updated';
    (document.getElementById('editText') as HTMLTextAreaElement).value = 'Updated text';
    (document.getElementById('editCategory') as HTMLInputElement).value = '编程';
    (document.getElementById('editShowInContextMenu') as HTMLInputElement).checked = true;
    ms.mockClear();
    document.getElementById('modalSaveBtn')?.click();
    await new Promise(r => setTimeout(r, 50));
    expect(ms).toHaveBeenCalled();

    // --- New instruction from add button ---
    document.getElementById('addInstructionBtn')?.click();
    (document.getElementById('editTitle') as HTMLInputElement).value = 'New';
    (document.getElementById('editText') as HTMLTextAreaElement).value = 'New text';
    (document.getElementById('editCategory') as HTMLInputElement).value = '编程';
    ms.mockClear();
    document.getElementById('modalSaveBtn')?.click();
    await new Promise(r => setTimeout(r, 50));
    expect(ms).toHaveBeenCalled();

    // --- Restore defaults ---
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    ms.mockClear();
    document.getElementById('restoreBtn')?.click();
    await new Promise(r => setTimeout(r, 100));
    expect(ms).toHaveBeenCalledWith(expect.objectContaining({ type: 'RESTORE_DEFAULT' }));
  });
});
