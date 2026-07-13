import { describe, it, expect, vi } from 'vitest';
const ms = vi.fn();
(globalThis as any).chrome = { runtime: { sendMessage: ms } };

describe('Options final', () => {
  it('covers remaining paths', async () => {
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
      { id:'a', category:'通用', title:'A', text:'A text', autoSend:false, enabled:true, order:1, showInContextMenu:false },
    ]}});
    await import('../../options/options.js');
    await new Promise(r => setTimeout(r, 50));

    // 1. Edit existing → save
    (document.querySelector('[data-action="edit"]') as HTMLElement)?.click();
    (document.getElementById('editTitle') as HTMLInputElement).value = 'Updated';
    (document.getElementById('editText') as HTMLTextAreaElement).value = 'Updated content';
    ms.mockClear();
    document.getElementById('modalSaveBtn')?.click();
    await new Promise(r => setTimeout(r, 50));
    expect(ms).toHaveBeenCalled();

    // 2. Empty field validation
    document.getElementById('addInstructionBtn')?.click();
    (document.getElementById('editTitle') as HTMLInputElement).value = '';
    (document.getElementById('editText') as HTMLTextAreaElement).value = '';
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    document.getElementById('modalSaveBtn')?.click();
    expect(alertSpy).toHaveBeenCalled();
    alertSpy.mockRestore();

    // 3. Export
    ms.mockClear();
    document.getElementById('exportBtn')?.click();
    expect(ms).toHaveBeenCalledWith(expect.objectContaining({ type: 'EXPORT_INSTRUCTIONS' }));

    // 4. Restore with confirm=true
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    ms.mockClear();
    document.getElementById('restoreBtn')?.click();
    await new Promise(r => setTimeout(r, 50));
    expect(ms).toHaveBeenCalled();

    // 5. Delete with confirm=true
    ms.mockClear();
    (document.querySelector('[data-action="delete"]') as HTMLElement)?.click();
    await new Promise(r => setTimeout(r, 50));
    expect(ms).toHaveBeenCalled();

    // 6. Import opens file picker
    ms.mockClear();
    document.getElementById('importBtn')?.click();
  });
});
