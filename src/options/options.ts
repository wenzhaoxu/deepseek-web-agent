import { MessageType } from "../shared/types.js";
import type { Instruction, GetInstructionsResponse } from "../shared/types.js";
import { createMessage, sendMessage } from "../shared/messages.js";

// --- State ---
let instructions: Instruction[] = [];
let selectedCategory: string | null = null; // null = "全部指令"
let editingInstruction: Instruction | null = null;

// --- DOM References ---
let categoryTree: HTMLElement | null = null;
let tableBody: HTMLElement | null = null;
let emptyState: HTMLElement | null = null;
let categoryEmptyState: HTMLElement | null = null;
let currentCategoryTitle: HTMLElement | null = null;
let editModal: HTMLElement | null = null;
let modalTitle: HTMLElement | null = null;
let editTitle: HTMLInputElement | null = null;
let editText: HTMLTextAreaElement | null = null;
let editCategory: HTMLInputElement | null = null;
let editAutoSend: HTMLInputElement | null = null;
let editShowInContextMenu: HTMLInputElement | null = null;
let editEnabled: HTMLInputElement | null = null;
let categoryList: HTMLElement | null = null;

// --- Initialization ---
document.addEventListener("DOMContentLoaded", async () => {
  cacheDomElements();
  await loadInstructions();
  renderCategoryTree();
  renderInstructionTable();
  setupEventListeners();
});

function cacheDomElements(): void {
  categoryTree = document.getElementById("categoryTree");
  tableBody = document.getElementById("tableBody");
  emptyState = document.getElementById("emptyState");
  categoryEmptyState = document.getElementById("categoryEmptyState");
  currentCategoryTitle = document.getElementById("currentCategoryTitle");
  editModal = document.getElementById("editModal");
  modalTitle = document.getElementById("modalTitle");
  editTitle = document.getElementById("editTitle") as HTMLInputElement;
  editText = document.getElementById("editText") as HTMLTextAreaElement;
  editCategory = document.getElementById("editCategory") as HTMLInputElement;
  editAutoSend = document.getElementById("editAutoSend") as HTMLInputElement;
  editShowInContextMenu = document.getElementById("editShowInContextMenu") as HTMLInputElement;
  editEnabled = document.getElementById("editEnabled") as HTMLInputElement;
  categoryList = document.getElementById("categoryList");
}

// --- Data Loading ---
async function loadInstructions(): Promise<void> {
  try {
    const response = await sendMessage<GetInstructionsResponse>(
      createMessage(MessageType.GET_INSTRUCTIONS)
    );
    if (response.success && response.data) {
      instructions = response.data.instructions;
    }
  } catch (err) {
    console.error("Options: Failed to load instructions", err);
  }
}

// --- Category Tree ---
function renderCategoryTree(): void {
  if (!categoryTree) return;

  const categories = extractCategories();
  let html = '<li class="category-item selected" data-category="__all__">全部指令</li>';
  for (const cat of categories) {
    const sel = cat === selectedCategory ? ' selected' : '';
    html += `<li class="category-item${sel}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</li>`;
  }
  categoryTree.innerHTML = html;
}

function extractCategories(): string[] {
  const catSet = new Set<string>();
  for (const inst of instructions) {
    if (inst.category) catSet.add(inst.category);
  }
  return Array.from(catSet).sort((a, b) => {
    const aIdx = instructions.findIndex((i) => i.category === a);
    const bIdx = instructions.findIndex((i) => i.category === b);
    return aIdx - bIdx;
  });
}

// --- Instruction Table ---
function renderInstructionTable(): void {
  if (!tableBody || !emptyState || !categoryEmptyState || !currentCategoryTitle) return;

  const filtered = getFilteredInstructions();
  filtered.sort((a, b) => a.order - b.order);

  currentCategoryTitle.textContent = selectedCategory || "全部指令";

  if (instructions.length === 0) {
    tableBody.innerHTML = "";
    emptyState.style.display = "block";
    categoryEmptyState.style.display = "none";
    return;
  }
  emptyState.style.display = "none";

  if (filtered.length === 0) {
    tableBody.innerHTML = "";
    categoryEmptyState.style.display = "block";
    return;
  }
  categoryEmptyState.style.display = "none";

  let html = "";
  for (const inst of filtered) {
    const preview =
      inst.text.length > 50 ? inst.text.substring(0, 50) + "..." : inst.text;
    html += `<tr draggable="true" data-id="${escapeHtml(inst.id)}" data-order="${inst.order}">`;
    html += `<td class="col-drag"><span class="drag-handle">⠿</span></td>`;
    html += `<td class="col-title">${escapeHtml(inst.title)}</td>`;
    html += `<td class="col-preview preview">${escapeHtml(preview)}</td>`;
    html += `<td class="col-category">${escapeHtml(inst.category)}</td>`;
    html += `<td class="col-autosend"><label class="toggle-switch"><input type="checkbox" ${inst.autoSend ? "checked" : ""} onchange="window.toggleAutoSend('${escapeHtml(inst.id)}', this.checked)"><span class="toggle-slider"></span></label></td>`;
    html += `<td class="col-enabled"><label class="toggle-switch"><input type="checkbox" ${inst.enabled ? "checked" : ""} onchange="window.toggleEnabled('${escapeHtml(inst.id)}', this.checked)"><span class="toggle-slider"></span></label></td>`;
    html += `<td class="col-actions"><button class="btn btn-sm btn-edit" onclick="window.openEditModal('${escapeHtml(inst.id)}')">编辑</button> <button class="btn btn-sm btn-danger" onclick="window.deleteInstruction('${escapeHtml(inst.id)}')">删除</button></td>`;
    html += `</tr>`;
  }
  tableBody.innerHTML = html;

  // Re-attach drag events
  setupDragAndDrop();
}

function getFilteredInstructions(): Instruction[] {
  if (selectedCategory === null) return [...instructions];
  return instructions.filter((i) => i.category === selectedCategory);
}

// --- CRUD Operations ---
async function saveCurrentInstruction(data: Partial<Instruction>): Promise<void> {
  if (!data.title || !data.text) return;

  try {
    let instruction: Instruction;
    if (editingInstruction) {
      instruction = { ...editingInstruction, ...data };
    } else {
      instruction = {
        id: crypto.randomUUID(),
        category: data.category || "通用",
        title: data.title || "",
        text: data.text || "",
        autoSend: data.autoSend ?? false,
        enabled: data.enabled ?? true,
        order: instructions.length > 0 ? Math.max(...instructions.map((i) => i.order)) + 1 : 1,
        showInContextMenu: data.showInContextMenu ?? false,
      };
    }

    await sendMessage(createMessage(MessageType.SAVE_INSTRUCTION, { instruction }));
    await loadInstructions();
    renderCategoryTree();
    renderInstructionTable();
  } catch (err) {
    console.error("Options: Failed to save instruction", err);
  }
}

async function deleteInstruction(id: string): Promise<void> {
  if (!confirm("确定删除此指令？")) return;

  try {
    await sendMessage(createMessage(MessageType.DELETE_INSTRUCTION, { id }));
    await loadInstructions();
    renderCategoryTree();
    renderInstructionTable();
  } catch (err) {
    console.error("Options: Failed to delete instruction", err);
  }
}

async function toggleAutoSend(id: string, checked: boolean): Promise<void> {
  const inst = instructions.find((i) => i.id === id);
  if (!inst) return;
  inst.autoSend = checked;
  try {
    await sendMessage(createMessage(MessageType.SAVE_INSTRUCTION, { instruction: inst }));
  } catch (err) {
    console.error("Options: Failed to toggle auto-send", err);
  }
}

async function toggleEnabled(id: string, checked: boolean): Promise<void> {
  const inst = instructions.find((i) => i.id === id);
  if (!inst) return;
  inst.enabled = checked;
  try {
    await sendMessage(createMessage(MessageType.SAVE_INSTRUCTION, { instruction: inst }));
  } catch (err) {
    console.error("Options: Failed to toggle enabled", err);
  }
}

// --- Drag and Drop ---
let draggedIndex: number | null = null;

function setupDragAndDrop(): void {
  if (!tableBody) return;

  const rows = tableBody.querySelectorAll("tr[draggable]");
  rows.forEach((row) => {
    (row as HTMLElement).addEventListener("dragstart", handleDragStart);
    (row as HTMLElement).addEventListener("dragover", handleDragOver);
    (row as HTMLElement).addEventListener("drop", handleDrop);
    (row as HTMLElement).addEventListener("dragend", handleDragEnd);
  });
}

function handleDragStart(e: DragEvent): void {
  const target = e.currentTarget as HTMLElement;
  const id = target.getAttribute("data-id");
  draggedIndex = instructions.findIndex((i) => i.id === id);
  if (draggedIndex === -1) draggedIndex = null;
  e.dataTransfer?.setData("text/plain", id || "");
  target.classList.add("dragging");
}

function handleDragOver(e: DragEvent): void {
  e.preventDefault();
  const target = e.currentTarget as HTMLElement;
  target.classList.add("drag-over");
}

function handleDrop(e: DragEvent): void {
  e.preventDefault();
  const target = e.currentTarget as HTMLElement;
  target.classList.remove("drag-over");

  if (draggedIndex === null) return;

  const dropId = target.getAttribute("data-id");
  const dropIndex = instructions.findIndex((i) => i.id === dropId);
  if (dropIndex === -1 || draggedIndex === dropIndex) return;

  const [moved] = instructions.splice(draggedIndex, 1);
  const adjustedDropIndex = dropIndex > draggedIndex ? dropIndex - 1 : dropIndex;
  instructions.splice(adjustedDropIndex, 0, moved);

  instructions.forEach((inst, idx) => {
    inst.order = idx + 1;
  });

  saveAllInstructions();
}

function handleDragEnd(e: DragEvent): void {
  const target = e.currentTarget as HTMLElement;
  target.classList.remove("dragging", "drag-over");

  if (tableBody) {
    tableBody.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
  }
}

async function saveAllInstructions(): Promise<void> {
  for (const inst of instructions) {
    try {
      await sendMessage(createMessage(MessageType.SAVE_INSTRUCTION, { instruction: inst }));
    } catch (err) {
      console.error("Options: Failed to save reordered instruction", err);
    }
  }
  renderInstructionTable();
}

// --- Edit Modal ---
function openEditModal(instructionId?: string): void {
  if (!editModal || !modalTitle || !editTitle || !editText || !editCategory || !editAutoSend || !editShowInContextMenu || !editEnabled || !categoryList) return;

  let instruction: Instruction | undefined;
  if (instructionId) {
    instruction = instructions.find((i) => i.id === instructionId);
  }

  if (instruction) {
    editingInstruction = instruction;
    modalTitle.textContent = "编辑指令";
    editTitle.value = instruction.title;
    editText.value = instruction.text;
    editCategory.value = instruction.category;
    editAutoSend.checked = instruction.autoSend;
    editShowInContextMenu.checked = instruction.showInContextMenu;
    editEnabled.checked = instruction.enabled;
  } else {
    editingInstruction = null;
    modalTitle.textContent = "新增指令";
    editTitle.value = "";
    editText.value = "";
    editCategory.value = "";
    editAutoSend.checked = false;
    editShowInContextMenu.checked = false;
    editEnabled.checked = true;
  }

  const categories = extractCategories();
  categoryList.innerHTML = categories.map((c) => `<option value="${escapeHtml(c)}">`).join("");

  editModal.style.display = "flex";
  editTitle.focus();
}

function closeEditModal(): void {
  if (!editModal) return;
  editModal.style.display = "none";
  editingInstruction = null;
}

function saveFromModal(): void {
  if (!editTitle || !editText || !editCategory || !editAutoSend || !editShowInContextMenu || !editEnabled) return;

  if (!editTitle.value.trim() || !editText.value.trim()) {
    alert("标题和内容不能为空");
    return;
  }

  saveCurrentInstruction({
    title: editTitle.value.trim(),
    text: editText.value.trim(),
    category: editCategory.value.trim() || "通用",
    autoSend: editAutoSend.checked,
    showInContextMenu: editShowInContextMenu.checked,
    enabled: editEnabled.checked,
  });

  closeEditModal();
}

// --- Import/Export ---
function importJSON(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!Array.isArray(data)) {
        alert("导入失败：JSON 格式不正确，需要一个数组");
        return;
      }

      for (const item of data) {
        if (!item.title || !item.text) {
          alert("导入失败：指令对象缺少 title 或 text 字段");
          return;
        }
      }

      const validated: Instruction[] = data.map((item: Partial<Instruction>, idx: number) => ({
        id: item.id || crypto.randomUUID(),
        category: item.category || "通用",
        title: item.title || "",
        text: item.text || "",
        autoSend: item.autoSend ?? false,
        enabled: item.enabled ?? true,
        order: item.order || idx + 1,
        showInContextMenu: item.showInContextMenu ?? false,
      }));

      if (!confirm(`确定导入 ${validated.length} 条指令？将覆盖所有现有指令。`)) return;

      await sendMessage(createMessage(MessageType.IMPORT_INSTRUCTIONS, { instructions: validated }));
      await loadInstructions();
      renderCategoryTree();
      renderInstructionTable();
      alert(`成功导入 ${validated.length} 条指令`);
    } catch (err) {
      alert("导入失败：文件格式错误");
      console.error("Options: Import failed", err);
    }
  });
  input.click();
}

async function exportJSON(): Promise<void> {
  try {
    const response = await sendMessage<GetInstructionsResponse>(
      createMessage(MessageType.EXPORT_INSTRUCTIONS)
    );
    if (!response.success || !response.data) {
      alert("导出失败");
      return;
    }

    const data = response.data.instructions;
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().split("T")[0];
    const filename = `deepseek-instructions-${date}.json`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("导出失败");
    console.error("Options: Export failed", err);
  }
}

async function restoreDefaults(): Promise<void> {
  if (!confirm("确定恢复默认指令？将覆盖所有现有指令")) return;

  try {
    await sendMessage(createMessage(MessageType.RESTORE_DEFAULT));
    await loadInstructions();
    renderCategoryTree();
    renderInstructionTable();
  } catch (err) {
    console.error("Options: Failed to restore defaults", err);
  }
}

async function batchToggle(enabled: boolean): Promise<void> {
  const filtered = getFilteredInstructions();
  if (filtered.length === 0) {
    alert("当前分类下无指令");
    return;
  }

  const action = enabled ? "启用" : "禁用";
  if (!confirm(`确定${action}当前分类下的 ${filtered.length} 条指令？`)) return;

  const ids = filtered.map((i) => i.id);
  try {
    await sendMessage(
      createMessage(MessageType.BATCH_OPERATIONS, {
        operation: enabled ? "enable" : "disable",
        ids,
      })
    );
    await loadInstructions();
    renderCategoryTree();
    renderInstructionTable();
  } catch (err) {
    console.error("Options: Batch toggle failed", err);
  }
}

// --- Event Listeners ---
function setupEventListeners(): void {
  // Category tree click (delegation)
  categoryTree?.addEventListener("click", (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest(".category-item") as HTMLElement;
    if (!target) return;

    const cat = target.getAttribute("data-category");
    if (cat === "__all__") {
      selectedCategory = null;
    } else {
      selectedCategory = cat;
    }

    renderCategoryTree();
    renderInstructionTable();
  });

  // Add category
  const addCategoryBtn = document.getElementById("addCategoryBtn");
  addCategoryBtn?.addEventListener("click", () => {
    const catName = prompt("请输入新分类名称：");
    if (catName && catName.trim()) {
      const trimmed = catName.trim();
      const existing = extractCategories();
      if (!existing.includes(trimmed)) {
        const newInst: Instruction = {
          id: crypto.randomUUID(),
          category: trimmed,
          title: "新建指令",
          text: "请输入指令内容",
          autoSend: false,
          enabled: true,
          order: instructions.length + 1,
          showInContextMenu: false,
        };
        sendMessage(createMessage(MessageType.SAVE_INSTRUCTION, { instruction: newInst })).then(() => {
          loadInstructions().then(() => {
            selectedCategory = trimmed;
            renderCategoryTree();
            renderInstructionTable();
          });
        });
      } else {
        alert("分类已存在");
      }
    }
  });

  // Toolbar buttons
  document.getElementById("importBtn")?.addEventListener("click", importJSON);
  document.getElementById("exportBtn")?.addEventListener("click", exportJSON);
  document.getElementById("restoreBtn")?.addEventListener("click", restoreDefaults);
  document.getElementById("batchEnableBtn")?.addEventListener("click", () => batchToggle(true));
  document.getElementById("batchDisableBtn")?.addEventListener("click", () => batchToggle(false));

  // Modal buttons
  document.getElementById("modalCancelBtn")?.addEventListener("click", closeEditModal);
  document.getElementById("modalSaveBtn")?.addEventListener("click", (e: Event) => {
    e.preventDefault();
    saveFromModal();
  });

  // Modal form submit
  const editForm = document.getElementById("editForm") as HTMLFormElement;
  editForm?.addEventListener("submit", (e: Event) => {
    e.preventDefault();
    saveFromModal();
  });

  // Close modal on overlay click
  editModal?.addEventListener("click", (e: MouseEvent) => {
    if (e.target === editModal) {
      closeEditModal();
    }
  });

  // Close modal on Escape
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && editModal?.style.display === "flex") {
      closeEditModal();
    }
  });
}

// --- Window-exposed functions for inline onclick handlers ---
(window as unknown as Record<string, unknown>).openEditModal = openEditModal;
(window as unknown as Record<string, unknown>).closeEditModal = closeEditModal;
(window as unknown as Record<string, unknown>).deleteInstruction = deleteInstruction;
(window as unknown as Record<string, unknown>).toggleAutoSend = toggleAutoSend;
(window as unknown as Record<string, unknown>).toggleEnabled = toggleEnabled;

// --- Helpers ---
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}
