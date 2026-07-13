import {
  MessageType, TabStatus,
  type GoalConfig, type GoalState, type GoalCheckTargetResult,
  type Instruction, type GetStatusResponse, type GetInstructionsResponse,
} from "../shared/types.js";
import { createMessage, sendMessage } from "../shared/messages.js";

// --- DOM References (cached after DOMContentLoaded) ---
let statusBar: HTMLElement | null = null;
let statusIcon: HTMLElement | null = null;
let statusText: HTMLElement | null = null;
let searchInput: HTMLInputElement | null = null;
let instructionList: HTMLElement | null = null;
let openDeepseekBtn: HTMLElement | null = null;
let manageInstructionsBtn: HTMLElement | null = null;
let tabBtns: NodeListOf<HTMLElement> | null = null;
let commandsPanel: HTMLElement | null = null;
let goalPanel: HTMLElement | null = null;

// --- State ---
let currentStatus: TabStatus = TabStatus.IDLE;
let instructions: Instruction[] = [];
let activeTab: 'commands' | 'goal' = 'commands';
let goalRunning = false;
let goalStatus: GoalState | null = null;
let selectedGoalInstIds = new Set<string>();
let targetString = '';
let maxRounds = 5;
let goalPollTimer: number | undefined;

// --- Initialization ---
document.addEventListener("DOMContentLoaded", async () => {
  cacheDomElements();
  if (!statusBar || !searchInput || !instructionList || !openDeepseekBtn || !manageInstructionsBtn) {
    console.error("Popup: Failed to cache DOM elements");
    return;
  }
  await Promise.all([loadStatus(), loadInstructions()]);
  setupEventListeners();
  setupTabSwitching();
  // Default to commands tab
});

function cacheDomElements(): void {
  statusBar = document.getElementById("status-bar");
  statusIcon = document.getElementById("status-icon");
  statusText = document.getElementById("status-text");
  searchInput = document.getElementById("search-input") as HTMLInputElement;
  instructionList = document.getElementById("instruction-list");
  openDeepseekBtn = document.getElementById("open-deepseek");
  manageInstructionsBtn = document.getElementById("manage-instructions");
  commandsPanel = document.getElementById("commands-panel");
  goalPanel = document.getElementById("goal-panel");
  tabBtns = document.querySelectorAll(".tab-btn") as NodeListOf<HTMLElement>;
}

// --- Tab Switching ---
function setupTabSwitching(): void {
  if (!tabBtns) return;
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab") as 'commands' | 'goal';
      if (tab) switchTab(tab);
    });
  });
}

function switchTab(tab: 'commands' | 'goal'): void {
  if (!tabBtns || !commandsPanel || !goalPanel) return;
  activeTab = tab;

  tabBtns.forEach((btn) => {
    const btnTab = btn.getAttribute("data-tab");
    btn.classList.toggle("active", btnTab === tab);
  });

  if (tab === 'commands') {
    commandsPanel.style.display = '';
    goalPanel.style.display = 'none';
    stopGoalPolling();
  } else {
    commandsPanel.style.display = 'none';
    goalPanel.style.display = '';
    renderGoalPanel();
    startGoalPolling();
  }
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

  let debounceTimer: number | undefined;
  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => renderInstructionList(), 150);
  });

  instructionList.addEventListener("click", (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const item = target.closest(".instruction-item") as HTMLElement | null;
    if (!item) return;

    const id = item.getAttribute("data-id");
    if (id) {
      executeInstruction(id);
    }
  });

  openDeepseekBtn.addEventListener("click", () => {
    sendMessage(createMessage(MessageType.OPEN_DEEPSEEK));
    window.close();
  });

  manageInstructionsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
}

async function executeInstruction(instructionId: string): Promise<void> {
  try {
    await sendMessage(createMessage(MessageType.EXECUTE_INSTRUCTION, { instructionId }));
  } catch (err) {
    console.error("Popup: Failed to execute instruction", err);
  }
  window.close();
}

// --- Goal Panel ---
function renderGoalPanel(): void {
  if (!goalPanel) return;

  goalPanel.innerHTML = `
<!-- Instruction Selection -->
<div class="goal-section">
  <div class="goal-section-title">选择指令</div>
  <div class="goal-checklist" id="goal-checklist"></div>
</div>

<!-- Target Configuration -->
<div class="goal-section">
  <div class="goal-section-title">目标文字</div>
  <input type="text" id="goal-target-input" class="goal-input" placeholder="输入目标文字..." value="${escapeHtml(targetString)}">
</div>

<div class="goal-section">
  <div class="goal-section-title">最大轮次</div>
  <input type="number" id="goal-max-rounds-input" class="goal-number-input" value="${maxRounds}" min="1" max="50">
</div>

<!-- Start / Stop Button -->
<div class="goal-section" style="border-bottom:none;">
  ${goalRunning
    ? '<button id="goal-stop-btn" class="goal-btn goal-btn-stop">停止执行</button>'
    : '<button id="goal-start-btn" class="goal-btn goal-btn-start">开始执行</button>'}
</div>

<!-- Progress Area (shown when running or has status) -->
<div id="goal-progress-area" style="${goalRunning || goalStatus ? '' : 'display:none;'}" class="goal-progress">
  <div id="goal-status-text" class="goal-status-text ${getStatusClass()}">${goalStatus?.statusText || ''}</div>
  <div class="goal-progress-detail" id="goal-progress-detail">
    ${goalStatus ? `第 ${goalStatus.currentRound}/${goalStatus.totalRounds} 轮 · 第 ${goalStatus.currentInstructionIndex + 1}/${goalStatus.totalInstructions} 条` : ''}
  </div>
  <div class="goal-progress-bar">
    <div id="goal-progress-fill" class="goal-progress-bar-fill" style="width: ${getProgressPercent()}%"></div>
  </div>
</div>
`;

  loadGoalChecklist();
  bindGoalEvents();
}

function getStatusClass(): string {
  if (goalStatus?.running) return 'running';
  if (goalStatus?.statusText.includes('完成')) return 'completed';
  if (goalStatus?.statusText.includes('停止')) return 'stopped';
  return '';
}

function getProgressPercent(): number {
  if (!goalStatus) return 0;
  return ((goalStatus.currentRound - 1) * goalStatus.totalInstructions + goalStatus.currentInstructionIndex) / (goalStatus.totalRounds * goalStatus.totalInstructions) * 100;
}

async function loadGoalChecklist(): Promise<void> {
  const container = document.getElementById("goal-checklist");
  if (!container) return;

  try {
    const response = await sendMessage<GetInstructionsResponse>(createMessage(MessageType.GET_INSTRUCTIONS));
    if (response.success && response.data) {
      const enabledInsts = response.data.instructions.filter((i: Instruction) => i.enabled);
      container.innerHTML = enabledInsts.map(inst => `
        <div class="goal-checklist-item">
          <input type="checkbox" id="goal-inst-${escapeHtml(inst.id)}" value="${escapeHtml(inst.id)}" ${selectedGoalInstIds.has(inst.id) ? 'checked' : ''}>
          <label for="goal-inst-${escapeHtml(inst.id)}">${escapeHtml(inst.title)}</label>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error("Goal: Failed to load instructions for checklist", err);
  }
}

function bindGoalEvents(): void {
  // Checkbox change events
  const checkboxes = document.querySelectorAll("#goal-checklist input[type='checkbox']");
  checkboxes.forEach(cb => {
    cb.addEventListener("change", (e) => {
      const input = e.target as HTMLInputElement;
      if (input.checked) {
        selectedGoalInstIds.add(input.value);
      } else {
        selectedGoalInstIds.delete(input.value);
      }
    });
  });

  // Target input
  const targetInput = document.getElementById("goal-target-input") as HTMLInputElement;
  if (targetInput) {
    targetInput.addEventListener("input", () => { targetString = targetInput.value; });
  }

  // Max rounds input
  const roundsInput = document.getElementById("goal-max-rounds-input") as HTMLInputElement;
  if (roundsInput) {
    roundsInput.addEventListener("input", () => {
      const val = parseInt(roundsInput.value, 10);
      if (!isNaN(val) && val >= 1) maxRounds = val;
    });
  }

  // Start button
  const startBtn = document.getElementById("goal-start-btn");
  if (startBtn) {
    startBtn.addEventListener("click", handleGoalStart);
  }

  // Stop button
  const stopBtn = document.getElementById("goal-stop-btn");
  if (stopBtn) {
    stopBtn.addEventListener("click", handleGoalStop);
  }
}

async function handleGoalStart(): Promise<void> {
  const checkedBoxes = document.querySelectorAll("#goal-checklist input[type='checkbox']:checked");
  const instIds = Array.from(checkedBoxes).map(cb => (cb as HTMLInputElement).value);

  if (instIds.length === 0) {
    alert("请至少选择一条指令");
    return;
  }

  const targetInput = document.getElementById("goal-target-input") as HTMLInputElement;
  const target = targetInput?.value.trim();
  if (!target) {
    alert("请输入目标文字");
    return;
  }

  targetString = target;
  selectedGoalInstIds = new Set(instIds);

  try {
    const config: GoalConfig = {
      instructionIds: instIds,
      targetString: target,
      maxRounds: maxRounds,
    };
    await sendMessage(createMessage(MessageType.GOAL_START, { config }));
    goalRunning = true;
    renderGoalPanel();
    startGoalPolling();
  } catch (err) {
    console.error("Goal: Failed to start", err);
  }
}

async function handleGoalStop(): Promise<void> {
  try {
    await sendMessage(createMessage(MessageType.GOAL_STOP));
    goalRunning = false;
    stopGoalPolling();
    renderGoalPanel();
  } catch (err) {
    console.error("Goal: Failed to stop", err);
  }
}

function startGoalPolling(): void {
  stopGoalPolling();
  goalPollTimer = window.setInterval(() => {
    if (activeTab === 'goal') {
      pollGoalStatus();
    }
  }, 1000);
}

function stopGoalPolling(): void {
  if (goalPollTimer !== undefined) {
    clearInterval(goalPollTimer);
    goalPollTimer = undefined;
  }
}

async function pollGoalStatus(): Promise<void> {
  try {
    const response = await sendMessage<GoalState>(createMessage(MessageType.GOAL_STATUS));
    if (response.success && response.data) {
      goalStatus = response.data;
      goalRunning = goalStatus.running;
      updateGoalProgress();
    }
  } catch (err) {
    console.error("Goal: Failed to poll status", err);
  }
}

function updateGoalProgress(): void {
  const statusTextEl = document.getElementById("goal-status-text");
  const detailEl = document.getElementById("goal-progress-detail");
  const fillEl = document.getElementById("goal-progress-fill");
  const progressArea = document.getElementById("goal-progress-area");

  if (!goalStatus) return;

  if (progressArea) {
    progressArea.style.display = '';
  }

  if (statusTextEl) {
    statusTextEl.className = `goal-status-text ${getStatusClass()}`;
    statusTextEl.textContent = goalStatus.statusText || '';
  }

  if (detailEl) {
    detailEl.textContent = `第 ${goalStatus.currentRound}/${goalStatus.totalRounds} 轮 · 第 ${goalStatus.currentInstructionIndex + 1}/${goalStatus.totalInstructions} 条`;
  }

  if (fillEl) {
    fillEl.style.width = `${getProgressPercent()}%`;
  }
}
