import { describe, it, expect, vi } from 'vitest';

const mockSendMessage = vi.fn();
(globalThis as any).chrome = {
  runtime: { sendMessage: mockSendMessage },
};

document.body.innerHTML = `
  <div class="options-container">
    <aside class="sidebar">
      <h2 class="sidebar-title">分类</h2>
      <ul class="category-tree" id="categoryTree"></ul>
      <button id="addCategoryBtn">+ 添加分类</button>
    </aside>
    <main class="main-content">
      <div class="toolbar">
        <h3 id="currentCategoryTitle">全部指令</h3>
        <button id="addInstructionBtn">+ 添加指令</button>
        <button id="importBtn">导入</button>
        <button id="exportBtn">导出</button>
        <button id="restoreBtn">恢复默认</button>
        <button id="batchEnableBtn">批量启用</button>
        <button id="batchDisableBtn">批量禁用</button>
      </div>
      <table class="instruction-table">
        <thead><tr>
          <th class="col-drag"></th><th class="col-title">标题</th>
          <th class="col-preview">内容预览</th>
          <th class="col-category">分类</th>
          <th class="col-enabled">启用</th><th class="col-actions">操作</th>
        </tr></thead>
        <tbody id="tableBody"></tbody>
      </table>
      <div id="emptyState" style="display:none">暂无指令。</div>
      <div id="categoryEmptyState" style="display:none">该分类下无指令</div>
    </main>
  </div>
  <div id="editModal" style="display:none;">
    <h3 id="modalTitle">编辑指令</h3>
    <form id="editForm">
      <input type="text" id="editTitle" required>
      <textarea id="editText" rows="4" required></textarea>
      <input type="text" id="editCategory" list="categoryList">
      <datalist id="categoryList"></datalist>
      <input type="checkbox" id="editShowInContextMenu">
      <input type="checkbox" id="editEnabled" checked>
      <button type="button" id="modalCancelBtn">取消</button>
      <button type="submit" id="modalSaveBtn">保存</button>
    </form>
  </div>
`;

describe('Options Page', () => {
  it('loads and renders everything', async () => {
    mockSendMessage.mockResolvedValue({
      success: true,
      data: {
        instructions: [
          { id: '1', category: '通用', title: '总结', text: '请总结', autoSend: false, enabled: true, order: 1, showInContextMenu: false },
          { id: '2', category: '编程', title: '解释代码', text: '请解释', autoSend: false, enabled: true, order: 2, showInContextMenu: false },
        ],
      },
    });

    await import('../../options/options.js');
    await new Promise(r => setTimeout(r, 100));

    // Table renders
    const body = document.getElementById('tableBody');
    expect(body?.children.length).toBe(2);
    expect(body?.textContent).toContain('总结');
    expect(body?.textContent).toContain('解释代码');

    // Category tree renders
    const tree = document.getElementById('categoryTree');
    expect(tree?.textContent).toContain('通用');
    expect(tree?.textContent).toContain('编程');

    // Add instruction opens modal
    document.getElementById('addInstructionBtn')?.click();
    expect(document.getElementById('editModal')?.style.display).toBe('flex');

    // Cancel closes modal
    document.getElementById('modalCancelBtn')?.click();
    expect(document.getElementById('editModal')?.style.display).toBe('none');

    // Export calls sendMessage
    mockSendMessage.mockClear();
    document.getElementById('exportBtn')?.click();
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'EXPORT_INSTRUCTIONS' })
    );
  });
});
