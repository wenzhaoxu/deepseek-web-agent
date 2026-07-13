import { TabStatus, MessageType } from '../shared/types.js';
import type {
  Instruction,
  ExtensionMessage,
  ExtensionResponse,
  FillTextPayload,
  FillResultPayload,
  GoalConfig,
  GoalState,
  GoalCheckTargetPayload,
  GoalCheckTargetResult,
} from '../shared/types.js';
import { STORAGE_KEYS, DEFAULT_INSTRUCTIONS, STATUS_CONFIG } from '../shared/constants.js';
import { createSuccessResponse, createErrorResponse } from '../shared/messages.js';

// ============================================================================
// State
// ============================================================================

const tabStatusMap = new Map<number, TabStatus>();

/** Pending CONTENT_SCRIPT_READY promises, keyed by tab id. */
const pendingReadyMap = new Map<
  number,
  {
    resolve: (value: boolean) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

/** Tabs that already sent CONTENT_SCRIPT_READY (resolve waitForTabReady immediately). */
const readyTabs = new Set<number>();

// ============================================================================
// Goal Engine
// ============================================================================

let goalState: GoalStateInternal = {
  running: false,
  config: null,
  currentRound: 0,
  currentInstructionIndex: 0,
  statusText: '',
  stopRequested: false,
  abortController: null,
};

/** Internal goal state with engine-only properties. */
interface GoalStateInternal {
  running: boolean;
  config: GoalConfig | null;
  currentRound: number;
  currentInstructionIndex: number;
  statusText: string;
  stopRequested: boolean;
  abortController: AbortController | null;
}

// Goal wait-for-IDLE promise
let idleResolver: (() => void) | null = null;

function onIdleDetected(): void {
  idleResolver?.();
  idleResolver = null;
}

// ============================================================================
// Storage CRUD
// ============================================================================

async function getInstructions(): Promise<Instruction[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.INSTRUCTIONS);
  return (result[STORAGE_KEYS.INSTRUCTIONS] as Instruction[]) || DEFAULT_INSTRUCTIONS;
}

async function saveInstruction(instruction: Instruction): Promise<void> {
  const instructions = await getInstructions();
  const index = instructions.findIndex(i => i.id === instruction.id);
  if (index >= 0) {
    instructions[index] = instruction;
  } else {
    instructions.push(instruction);
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.INSTRUCTIONS]: instructions });
  refreshContextMenus();
}

async function deleteInstruction(id: string): Promise<void> {
  const instructions = await getInstructions();
  const filtered = instructions.filter(i => i.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEYS.INSTRUCTIONS]: filtered });
  refreshContextMenus();
}

async function batchOperations(operation: string, ids: string[]): Promise<void> {
  const instructions = await getInstructions();
  const updated = instructions
    .map(i => {
      if (ids.includes(i.id)) {
        switch (operation) {
          case 'enable':
            return { ...i, enabled: true };
          case 'disable':
            return { ...i, enabled: false };
          case 'delete':
            return null;
          default:
            return i;
        }
      }
      return i;
    })
    .filter((i): i is Instruction => i !== null);
  await chrome.storage.local.set({ [STORAGE_KEYS.INSTRUCTIONS]: updated });
  refreshContextMenus();
}

async function importInstructions(instructions: Instruction[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.INSTRUCTIONS]: instructions });
  refreshContextMenus();
}

async function restoreDefaults(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.INSTRUCTIONS]: DEFAULT_INSTRUCTIONS });
  refreshContextMenus();
}

// ============================================================================
// Tab Status Persistence
// ============================================================================

const TAB_STATUSES_KEY = 'tabStatuses';

async function loadTabStatuses(): Promise<void> {
  const result = await chrome.storage.local.get(TAB_STATUSES_KEY);
  const saved = result[TAB_STATUSES_KEY] as Record<string, string> | undefined;
  if (saved) {
    for (const [tabIdStr, status] of Object.entries(saved)) {
      tabStatusMap.set(Number(tabIdStr), status as TabStatus);
    }
  }
}

function persistTabStatuses(): void {
  const record: Record<string, string> = {};
  for (const [tabId, status] of tabStatusMap.entries()) {
    record[String(tabId)] = status;
  }
  chrome.storage.local.set({ [TAB_STATUSES_KEY]: record }).catch(() => {});
}

// ============================================================================
// Tab Management
// ============================================================================

async function findOrCreateDeepSeekTab(): Promise<number> {
  const tabs = await chrome.tabs.query({ url: '*://chat.deepseek.com/*' });
  if (tabs.length > 0 && tabs[0].id) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
    return tabs[0].id;
  }
  const tab = await chrome.tabs.create({ url: 'https://chat.deepseek.com', active: true });
  if (!tab.id) {
    throw new Error('未找到 DeepSeek 标签页');
  }
  return tab.id;
}

function waitForTabReady(tabId: number): Promise<boolean> {
  // Tab already reported ready — resolve instantly
  if (readyTabs.has(tabId)) {
    return Promise.resolve(true);
  }
  return new Promise<boolean>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingReadyMap.delete(tabId);
      reject(new Error('页面加载超时'));
    }, STATUS_CONFIG.PAGE_LOAD_TIMEOUT_MS);
    pendingReadyMap.set(tabId, { resolve, reject, timer });
  });
}

async function executeInstruction(
  instructionId: string,
  selectedText?: string,
): Promise<ExtensionResponse<FillResultPayload>> {
  try {
    const instructions = await getInstructions();
    const instruction = instructions.find(i => i.id === instructionId);
    if (!instruction) {
      return createErrorResponse('指令不存在');
    }

    let tabId: number;
    try {
      tabId = await findOrCreateDeepSeekTab();
    } catch {
      return createErrorResponse('未找到 DeepSeek 标签页');
    }

    const text = selectedText
      ? `${instruction.text}\n${selectedText}`
      : instruction.text;

    const fillMsg: ExtensionMessage = {
      type: MessageType.FILL_TEXT,
      payload: { text } as FillTextPayload,
    };

    // Try sending FILL_TEXT directly — works if content script is already running
    try {
      const response = await chrome.tabs.sendMessage<
        ExtensionMessage,
        ExtensionResponse<FillResultPayload>
      >(tabId, fillMsg);
      return response || createSuccessResponse({ status: 'success' });
    } catch {
      // Content script not responding — tab probably just opened, wait for ready
    }

    // Wait for content script to come online, then retry
    try {
      await waitForTabReady(tabId);
    } catch {
      return createErrorResponse('页面加载超时');
    }

    const response = await chrome.tabs.sendMessage<
      ExtensionMessage,
      ExtensionResponse<FillResultPayload>
    >(tabId, fillMsg);
    return response || createSuccessResponse({ status: 'success' });
  } catch (err) {
    return createErrorResponse(err instanceof Error ? err.message : '指令执行失败');
  }
}

// ============================================================================
// Context Menus
// ============================================================================

let _refreshing = false;

function refreshContextMenus(): void {
  if (_refreshing) return;
  _refreshing = true;
  chrome.contextMenus.removeAll(async () => {
    try {
      chrome.contextMenus.create({
        id: 'send-to-deepseek',
        title: '发送至 DeepSeek',
        contexts: ['selection'],
      });
      const instructions = await getInstructions();
      for (const inst of instructions) {
        if (inst.showInContextMenu) {
          chrome.contextMenus.create({
            id: inst.id,
            parentId: 'send-to-deepseek',
            title: inst.title,
            contexts: ['selection'],
          });
        }
      }
    } catch (err) {
      console.error('刷新右键菜单失败:', err);
    } finally {
      _refreshing = false;
    }
  });
}

// ============================================================================
// Badge
// ============================================================================

function updateBadge(tabId: number, status: TabStatus): void {
  if (status === TabStatus.GENERATING) {
    chrome.action.setBadgeText({ tabId, text: '●' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#F97316' });
  } else {
    chrome.action.setBadgeText({ tabId, text: '' });
  }
}

// ============================================================================
// Message Handler
// ============================================================================

async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
): Promise<ExtensionResponse> {
  try {
    switch (message.type) {
      case MessageType.CONTENT_SCRIPT_READY: {
        const tabId = sender.tab?.id;
        if (tabId) {
          readyTabs.add(tabId);
          if (pendingReadyMap.has(tabId)) {
            const pending = pendingReadyMap.get(tabId)!;
            clearTimeout(pending.timer);
            pending.resolve(true);
            pendingReadyMap.delete(tabId);
          }
        }
        return createSuccessResponse({ ready: true });
      }

      case MessageType.STATUS_CHANGE: {
        const payload = message.payload as { status: TabStatus };
        const tabId = sender.tab?.id;
        if (tabId !== undefined) {
          tabStatusMap.set(tabId, payload.status);
          persistTabStatuses();
          updateBadge(tabId, payload.status);
          // Notify goal engine
          if (payload.status === TabStatus.IDLE) {
            onIdleDetected();
          }
        }
        return createSuccessResponse({ updated: true });
      }

      case MessageType.DISCONNECT: {
        const tabId = sender.tab?.id;
        if (tabId !== undefined) {
          readyTabs.delete(tabId);
          if (tabStatusMap.has(tabId)) {
            tabStatusMap.delete(tabId);
            persistTabStatuses();
          }
        }
        return createSuccessResponse({ disconnected: true });
      }

      case MessageType.EXECUTE_INSTRUCTION: {
        const payload = message.payload as { instructionId: string };
        return executeInstruction(payload.instructionId);
      }

      case MessageType.GET_INSTRUCTIONS: {
        const instructions = await getInstructions();
        return createSuccessResponse({ instructions });
      }

      case MessageType.SAVE_INSTRUCTION: {
        const payload = message.payload as { instruction: Instruction };
        await saveInstruction(payload.instruction);
        return createSuccessResponse({ saved: true });
      }

      case MessageType.DELETE_INSTRUCTION: {
        const payload = message.payload as { id: string };
        await deleteInstruction(payload.id);
        return createSuccessResponse({ deleted: true });
      }

      case MessageType.GET_STATUS: {
        const statusInfo = await getActiveTabStatus();
        return createSuccessResponse(statusInfo);
      }

      case MessageType.BATCH_OPERATIONS: {
        const payload = message.payload as { operation: string; ids: string[] };
        await batchOperations(payload.operation, payload.ids);
        return createSuccessResponse({ completed: true });
      }

      case MessageType.IMPORT_INSTRUCTIONS: {
        const payload = message.payload as { instructions: Instruction[] };
        await importInstructions(payload.instructions);
        return createSuccessResponse({ imported: true });
      }

      case MessageType.EXPORT_INSTRUCTIONS: {
        const instructions = await getInstructions();
        return createSuccessResponse({ instructions });
      }

      case MessageType.RESTORE_DEFAULT: {
        await restoreDefaults();
        return createSuccessResponse({ restored: true });
      }

      case MessageType.OPEN_DEEPSEEK: {
        const tabId = await findOrCreateDeepSeekTab();
        return createSuccessResponse({ tabId });
      }

      case MessageType.GOAL_START: {
        const payload = message.payload as { config: GoalConfig };
        if (goalState.running) {
          return createErrorResponse('已有目标正在运行');
        }
        // Start goal loop asynchronously (don't await - it runs in background)
        runGoal(payload.config).catch(err => {
          console.error('Goal execution error:', err);
        });
        return createSuccessResponse({ started: true });
      }

      case MessageType.GOAL_STOP: {
        goalState.stopRequested = true;
        goalState.abortController?.abort();
        goalState.running = false;
        goalState.statusText = '已停止';
        return createSuccessResponse({ stopped: true });
      }

      case MessageType.GOAL_STATUS: {
        return createSuccessResponse({
          running: goalState.running,
          currentRound: goalState.currentRound,
          totalRounds: goalState.config?.maxRounds || 0,
          currentInstructionIndex: goalState.currentInstructionIndex,
          totalInstructions: goalState.config?.instructionIds.length || 0,
          statusText: goalState.statusText,
        } as GoalState);
      }

      case MessageType.GOAL_CHECK_TARGET_RESULT: {
        // Forward result from content script if needed
        return createSuccessResponse({ received: true });
      }

      default:
        return createErrorResponse('未知消息类型');
    }
  } catch (err) {
    return createErrorResponse(err instanceof Error ? err.message : '未知错误');
  }
}

// ============================================================================
// Exported API
// ============================================================================

export function getTabStatus(tabId: number): TabStatus {
  return tabStatusMap.get(tabId) || TabStatus.IDLE;
}

export async function getActiveTabStatus(): Promise<{ status: TabStatus; tabId?: number }> {
  const tabs = await chrome.tabs.query({
    url: '*://chat.deepseek.com/*',
    active: true,
    currentWindow: true,
  });
  if (tabs.length > 0 && tabs[0].id) {
    const status = tabStatusMap.get(tabs[0].id) || TabStatus.IDLE;
    return { status, tabId: tabs[0].id };
  }
  return { status: TabStatus.IDLE };
}

// ============================================================================
// Goal Engine Helpers
// ============================================================================

async function runGoal(config: GoalConfig): Promise<void> {
  // Reset state
  goalState = {
    running: true,
    config,
    currentRound: 0,
    currentInstructionIndex: 0,
    statusText: '启动中...',
    stopRequested: false,
    abortController: new AbortController(),
  };

  try {
    // Load all instructions to get text content
    const allInstructions = await getInstructions();

    for (let round = 1; round <= config.maxRounds; round++) {
      if (goalState.stopRequested) break;
      goalState.currentRound = round;
      goalState.statusText = `第 ${round}/${config.maxRounds} 轮`;

      for (let idx = 0; idx < config.instructionIds.length; idx++) {
        if (goalState.stopRequested) break;
        goalState.currentInstructionIndex = idx;

        const instId = config.instructionIds[idx];
        const instruction = allInstructions.find(i => i.id === instId);
        if (!instruction) continue;

        // Step 1: Wait for IDLE
        goalState.statusText = '等待回复完成...';
        await waitForIdle();

        // Step 2: Random delay 2-4s
        const delay = Math.random() * 2000 + 2000;
        goalState.statusText = `定时等待中 (${Math.round(delay / 1000)}s)...`;
        await sleep(delay);

        if (goalState.stopRequested) break;

        // Step 3: Send instruction text
        goalState.statusText = '发送指令...';
        try {
          const tabId = await findOrCreateDeepSeekTab();

          // Fill text (no auto-send)
          await chrome.tabs.sendMessage(tabId, {
            type: MessageType.FILL_TEXT,
            payload: { text: instruction.text } as FillTextPayload,
          });

          // Step 4: Wait for response (GENERATING -> IDLE)
          goalState.statusText = '等待回复中...';
          await waitForResponse();

          // Step 5: Check target string
          if (config.targetString) {
            goalState.statusText = '检查目标字符串...';
            const checkResult = await chrome.tabs.sendMessage<
              ExtensionMessage,
              ExtensionResponse<GoalCheckTargetResult>
            >(tabId, {
              type: MessageType.GOAL_CHECK_TARGET,
              payload: { targetString: config.targetString } as GoalCheckTargetPayload,
            });

            if (checkResult?.data?.found) {
              goalState.statusText = `已完成: 命中目标「${config.targetString}」`;
              goalState.running = false;
              return;
            }
          }
        } catch (err) {
          console.error('Goal: instruction execution failed', err);
          goalState.statusText = `执行失败: ${err instanceof Error ? err.message : '未知错误'}`;
          // Continue to next instruction despite error
        }
      }
    }

    if (!goalState.stopRequested) {
      goalState.statusText = `已完成: 达到最大轮数 (${config.maxRounds})`;
    }
  } catch (err) {
    console.error('Goal: engine error', err);
    goalState.statusText = '引擎异常';
  } finally {
    goalState.running = false;
  }
}

async function waitForIdle(): Promise<void> {
  // Check current tab status first
  const status = await getActiveTabStatus();
  if (status.status === TabStatus.IDLE) return;

  // Wait for STATUS_CHANGE -> IDLE
  return new Promise<void>(resolve => {
    idleResolver = resolve;
    // Safety timeout: if no IDLE within 60s, continue anyway
    setTimeout(() => {
      if (idleResolver) {
        idleResolver();
        idleResolver = null;
      }
    }, 60000);
  });
}

async function waitForResponse(): Promise<void> {
  // Wait for GENERATING -> IDLE transition
  return new Promise<void>(resolve => {
    idleResolver = resolve;
    // Safety timeout
    setTimeout(() => {
      if (idleResolver) {
        idleResolver();
        idleResolver = null;
      }
    }, 120000); // 2 min max wait for a response
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Event Listeners
// ============================================================================

chrome.runtime.onInstalled.addListener(() => {
  // onInstalled fires once on install/update; the boot-level init() already
  // handles the SW-start case, so we only need to refresh context menus here
  // in case storage was migrated or permissions changed.
  refreshContextMenus();
});

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender: chrome.runtime.MessageSender) => {
    return handleMessage(message, sender);
  },
);

chrome.tabs.onRemoved.addListener((tabId: number) => {
  if (tabStatusMap.has(tabId)) {
    tabStatusMap.delete(tabId);
    persistTabStatuses();
    chrome.action.setBadgeText({ tabId, text: '' });
  }
});

chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: { url?: string }) => {
  if (changeInfo.url && !changeInfo.url.startsWith('https://chat.deepseek.com')) {
    if (tabStatusMap.has(tabId)) {
      tabStatusMap.delete(tabId);
      persistTabStatuses();
      chrome.action.setBadgeText({ tabId, text: '' });
    }
  }
});

chrome.contextMenus.onClicked.addListener(
  (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
    const selectedText = info.selectionText || '';

    if (info.menuItemId === 'send-to-deepseek') {
      if (tab?.id) {
        chrome.tabs
          .sendMessage(tab.id, {
            type: MessageType.FILL_TEXT,
            payload: { text: selectedText } as FillTextPayload,
          })
          .catch(() => {});
      }
    } else {
      const instructionId = info.menuItemId as string;
      executeInstruction(instructionId, selectedText);
    }
  },
);

// ============================================================================
// Initialization
// ============================================================================

async function init(): Promise<void> {
  try {
    await loadTabStatuses();
    refreshContextMenus();
  } catch (err) {
    console.error('Service Worker 初始化失败:', err);
  }
}

// ============================================================================
// Boot
// ============================================================================

init();
