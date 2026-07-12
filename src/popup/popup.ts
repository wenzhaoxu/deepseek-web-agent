import { MessageType, TabStatus, type Instruction, type GetStatusResponse, type GetInstructionsResponse } from "../shared/types.js";
import { createMessage, sendMessage } from "../shared/messages.js";

// --- DOM References (cached after DOMContentLoaded) ---
// Use let variables for all cached DOM elements
let statusBar: HTMLElement | null = null;
let statusIcon: HTMLElement | null = null;
let statusText: HTMLElement | null = null;
let searchInput: HTMLInputElement | null = null;
let instructionList: HTMLElement | null = null;
let openDeepseekBtn: HTMLElement | null = null;
let manageInstructionsBtn: HTMLElement | null = null;

// --- State ---
let currentStatus: TabStatus = TabStatus.IDLE;
let instructions: Instruction[] = [];

// --- Initialization ---
document.addEventListener("DOMContentLoaded", async () => {
  cacheDomElements();
  if (!statusBar || !searchInput || !instructionList || !openDeepseekBtn || !manageInstructionsBtn) {
    console.error("Popup: Failed to cache DOM elements");
    return;
  }
  await Promise.all([loadStatus(), loadInstructions()]);
  setupEventListeners();
});

function cacheDomElements(): void {
  statusBar = document.getElementById("status-bar");
  statusIcon = document.getElementById("status-icon");
  statusText = document.getElementById("status-text");
  searchInput = document.getElementById("search-input") as HTMLInputElement;
  instructionList = document.getElementById("instruction-list");
  openDeepseekBtn = document.getElementById("open-deepseek");
  manageInstructionsBtn = document.getElementById("manage-instructions");
}

// --- Status ---
async function loadStatus(): Promise<void> {
  try {
    const response = await sendMessage<GetStatusResponse>(createMessage(MessageType.GET_STATUS));
    if (response.success && response.data) {
      currentStatus = response.data.status;
    }
  } catch (err) {
    console.error("Popup: Failed to load status", err);
  }
  renderStatusBar();
}

function renderStatusBar(): void {
  if (!statusBar || !statusIcon || !statusText) return;

  // Remove both status classes and re-add the correct one
  statusBar.classList.remove("status-bar--idle", "status-bar--generating");

  if (currentStatus === TabStatus.GENERATING) {
    statusBar.classList.add("status-bar--generating");
    statusIcon.textContent = "⏳";
    statusText.innerHTML = '模型回复中<span class="status-dots"></span>';
  } else {
    statusBar.classList.add("status-bar--idle");
    statusIcon.textContent = "🟢";
    statusText.textContent = "可输入";
  }
}

function isGenerating(): boolean {
  return currentStatus === TabStatus.GENERATING;
}

// --- Instructions ---
async function loadInstructions(): Promise<void> {
  try {
    const response = await sendMessage<GetInstructionsResponse>(createMessage(MessageType.GET_INSTRUCTIONS));
    if (response.success && response.data) {
      instructions = response.data.instructions.filter((i: Instruction) => i.enabled);
    }
  } catch (err) {
    console.error("Popup: Failed to load instructions", err);
  }
  // NOTE: renderInstructionList is NOT called here directly;
  // the caller (DOMContentLoaded) calls setupEventListeners after both loads resolve,
  // and setupEventListeners calls renderInstructionList for initial render.
  // But some code paths call loadInstructions alone (e.g., after save).
  // To be safe, call render after setting instructions:
  renderInstructionList();
}

function renderInstructionList(): void {
  if (!instructionList) return;

  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const filtered = query
    ? instructions.filter((i) => i.title.toLowerCase().includes(query))
    : instructions;

  if (filtered.length === 0) {
    instructionList.innerHTML = `<div class="empty-state">${
      instructions.length === 0 ? "暂无可用指令" : "无匹配指令"
    }</div>`;
    return;
  }

  // Group by category, preserving original order
  const categoryMap = new Map<string, Instruction[]>();
  for (const inst of filtered) {
    const cat = inst.category;
    if (!categoryMap.has(cat)) categoryMap.set(cat, []);
    categoryMap.get(cat)!.push(inst);
  }

  // Restore previously expanded categories from the rendered DOM
  // (since the DOM gets rebuilt each time, we extract from current DOM before rebuilding)
  const expandedCats = new Set<string>();
  const existingDetails = instructionList.querySelectorAll("details");
  existingDetails.forEach((d) => {
    const summaryEl = d.querySelector("summary");
    if (summaryEl && d.open) {
      const catName = summaryEl.getAttribute("data-category") || summaryEl.textContent?.trim() || "";
      if (catName) expandedCats.add(catName);
    }
  });

  let html = "";
  for (const [category, items] of categoryMap) {
    const isExpanded = expandedCats.has(category);
    html += `<details ${isExpanded ? "open" : ""}>`;
    html += `<summary data-category="${escapeHtml(category)}">${escapeHtml(category)}</summary>`;
    for (const item of items) {
      html += `<div class="instruction-item" data-id="${escapeHtml(item.id)}">`;
      html += `<span class="instruction-item__title">${escapeHtml(item.title)}</span>`;
      const disabled = isGenerating() ? 'disabled' : '';
      const checked = item.autoSend ? 'checked' : '';
      html += `<label class="toggle-switch ${disabled}" data-id="${escapeHtml(item.id)}">`;
      html += `<input type="checkbox" ${checked} ${disabled}>`;
      html += `<span class="toggle-slider"></span>`;
      html += `</label>`;
      html += `</div>`;
    }
    html += `</details>`;
  }

  instructionList.innerHTML = html;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

// --- Event Handlers ---
function setupEventListeners(): void {
  if (!searchInput || !instructionList || !openDeepseekBtn || !manageInstructionsBtn) return;

  // Search input: debounced re-filter
  let debounceTimer: number | undefined;
  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => renderInstructionList(), 150);
  });

  // Delegate: instruction item click → execute instruction
  // Delegate: toggle switch change → toggle auto-send
  // Use event delegation on instructionList
  instructionList.addEventListener("click", (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    // Find the instruction-item ancestor
    const item = target.closest(".instruction-item") as HTMLElement | null;
    if (!item) return;

    const toggleLabel = target.closest(".toggle-switch") as HTMLElement | null;
    // If clicking on the toggle switch or its children, don't execute instruction
    if (toggleLabel) return;

    const id = item.getAttribute("data-id");
    if (id) {
      executeInstruction(id);
    }
  });

  // Toggle switch changes (use change event on the list)
  instructionList.addEventListener("change", (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.type === "checkbox") {
      const toggleLabel = target.closest(".toggle-switch") as HTMLElement | null;
      if (toggleLabel) {
        const id = toggleLabel.getAttribute("data-id");
        if (id) {
          toggleAutoSend(id, target.checked);
        }
      }
    }
  });

  // "打开 DeepSeek" button
  openDeepseekBtn.addEventListener("click", () => {
    sendMessage(createMessage(MessageType.OPEN_DEEPSEEK));
    window.close();
  });

  // "管理指令" button
  manageInstructionsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
}

// --- Execute ---
async function executeInstruction(instructionId: string): Promise<void> {
  try {
    await sendMessage(createMessage(MessageType.EXECUTE_INSTRUCTION, { instructionId }));
  } catch (err) {
    console.error("Popup: Failed to execute instruction", err);
  }
  window.close();
}

// --- Auto-send toggle ---
async function toggleAutoSend(instructionId: string, autoSend: boolean): Promise<void> {
  const instruction = instructions.find((i) => i.id === instructionId);
  if (!instruction) return;

  // If currently generating and trying to turn autoSend ON, prevent it
  if (isGenerating() && autoSend) {
    // Re-render to restore state (the checkbox change will be reverted by re-render)
    renderInstructionList();
    return;
  }

  instruction.autoSend = autoSend;
  try {
    await sendMessage(createMessage(MessageType.SAVE_INSTRUCTION, { instruction }));
  } catch (err) {
    console.error("Popup: Failed to save instruction", err);
  }
}
