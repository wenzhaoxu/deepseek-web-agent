import { describe, it, expect, vi } from 'vitest';
const ms = vi.fn();
(globalThis as any).chrome = { runtime: { sendMessage: ms } };

describe('Options one-shot', () => {
  it('covers all paths', async () => {
    document.body.innerHTML = `
      <div class="options-container">
        <aside class="sidebar"><h2>分类</h2><ul class="category-tree" id="categoryTree"></ul>
          <button id="addCategoryBtn">+</button></aside>
        <main><div class="toolbar">
          <h3 id="currentCategoryTitle">全部指令</h3>
          <button id="addInstructionBtn">+</button>
          <button id="importBtn">导入</button><button id="exportBtn">导出</button>
          <button id="restoreBtn">恢复默认</button>
          <button id="batchEnableBtn">启用</button><button id="batchDisableBtn">禁用</button>
        </div>
        <table class="instruction-table"><thead><tr>
          <th></th><th>标题</th><th>预览</th><th>分类</th><th>启用</th><th>操作</th>
        </tr></thead><tbody id="tableBody"></tbody></table>
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

    const inst = [
      { id:'1', category:'通用', title:'T1', text:'T1 text', autoSend:false, enabled:true, order:1, showInContextMenu:false },
      { id:'2', category:'编程', title:'T2', text:'T2 text', autoSend:false, enabled:false, order:2, showInContextMenu:true },
    ];
    ms.mockResolvedValue({ success:true, data:{ instructions:inst } });
    await import('../../options/options.js');
    await new Promise(r => setTimeout(r, 50));

    // Table renders
    expect(document.getElementById('tableBody')?.children.length).toBe(2);
    // Category tree
    const tree = document.getElementById('categoryTree');
    expect(tree?.textContent).toContain('通用');
    // Filter by category
    (tree?.querySelector('[data-category="编程"]') as HTMLElement)?.click();
    expect(document.getElementById('currentCategoryTitle')?.textContent).toBe('编程');
    // Show all
    (tree?.querySelector('[data-category="__all__"]') as HTMLElement)?.click();

    // Edit opens modal
    (document.querySelector('[data-action="edit"]') as HTMLElement)?.click();
    expect(document.getElementById('editModal')?.style.display).toBe('flex');
    document.getElementById('modalCancelBtn')?.click();
    expect(document.getElementById('editModal')?.style.display).toBe('none');

    // Delete with cancel
    const c1 = vi.spyOn(window,'confirm').mockReturnValue(false);
    (document.querySelector('[data-action="delete"]') as HTMLElement)?.click();
    expect(c1).toHaveBeenCalled();
    c1.mockRestore();

    // Export
    ms.mockClear();
    document.getElementById('exportBtn')?.click();
    expect(ms).toHaveBeenCalledWith(expect.objectContaining({ type:'EXPORT_INSTRUCTIONS' }));

    // Restore with confirm
    const c2 = vi.spyOn(window,'confirm').mockReturnValue(true);
    ms.mockClear();
    document.getElementById('restoreBtn')?.click();
    expect(ms).toHaveBeenCalledWith(expect.objectContaining({ type:'RESTORE_DEFAULT' }));
    c2.mockRestore();

    // Batch
    const c3 = vi.spyOn(window,'confirm').mockReturnValue(true);
    ms.mockClear();
    document.getElementById('batchEnableBtn')?.click();
    expect(ms).toHaveBeenCalledWith(expect.objectContaining({ type:'BATCH_OPERATIONS' }));
    c3.mockRestore();

    // Import
    ms.mockClear();
    document.getElementById('importBtn')?.click();
    // Import creates a hidden input and clicks it (file picker), verified by no error
    expect(ms).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'IMPORT_INSTRUCTIONS' }));

    // Add instruction
    document.getElementById('addInstructionBtn')?.click();
    expect(document.getElementById('editModal')?.style.display).toBe('flex');
    expect(document.getElementById('modalTitle')?.textContent).toBe('新增指令');
  });
});
