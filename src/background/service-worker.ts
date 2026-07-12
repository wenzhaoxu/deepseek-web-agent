import { TabStatus, MessageType } from '../shared/types.js';
import type {
  Instruction,
  ExtensionMessage,
  ExtensionResponse,
  FillTextPayload,
  FillResultPayload,
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
