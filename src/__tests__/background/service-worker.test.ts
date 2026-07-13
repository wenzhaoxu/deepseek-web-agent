import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all chrome APIs
const mockStorageGet = vi.fn();
const mockStorageSet = vi.fn();
const mockOnMessageListener = vi.fn();
const mockOnInstalledListener = vi.fn();
const mockTabsQuery = vi.fn();
const mockTabsUpdate = vi.fn();
const mockTabsCreate = vi.fn();
const mockTabsSendMessage = vi.fn();
const mockTabsOnRemoved = vi.fn();
const mockTabsOnUpdated = vi.fn();
const mockWindowsUpdate = vi.fn();
const mockContextMenusRemoveAll = vi.fn();
const mockContextMenusCreate = vi.fn();
const mockContextMenusOnClicked = vi.fn();
const mockBadgeSetText = vi.fn();
const mockBadgeSetBgColor = vi.fn();
const mockActionSetBadgeText = vi.fn();
const mockActionSetBadgeBg = vi.fn();

(globalThis as any).chrome = {
  storage: {
    local: {
      get: mockStorageGet,
      set: mockStorageSet,
    },
  },
  runtime: {
    onMessage: { addListener: mockOnMessageListener },
    onInstalled: { addListener: mockOnInstalledListener },
    id: 'test-extension-id',
  },
  tabs: {
    query: mockTabsQuery,
    update: mockTabsUpdate,
    create: mockTabsCreate,
    sendMessage: mockTabsSendMessage,
    onRemoved: { addListener: mockTabsOnRemoved },
    onUpdated: { addListener: mockTabsOnUpdated },
  },
  windows: {
    update: mockWindowsUpdate,
  },
  contextMenus: {
    removeAll: mockContextMenusRemoveAll,
    create: mockContextMenusCreate,
    onClicked: { addListener: mockContextMenusOnClicked },
  },
  action: {
    setBadgeText: mockActionSetBadgeText,
    setBadgeBackgroundColor: mockActionSetBadgeBg,
  },
};

async function loadSW() {
  vi.resetModules();
  return import('../../background/service-worker.js');
}

describe('Service Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageGet.mockReset();
    mockStorageSet.mockReset();
    mockStorageSet.mockResolvedValue(undefined); // persistTabStatuses uses .catch()
    // Default: storage returns no saved data
    mockStorageGet.mockResolvedValue({});
    // Default: contextMenus.removeAll calls its callback
    mockContextMenusRemoveAll.mockImplementation((cb: any) => cb && cb());
  });

  it('should register onMessage listener on boot', async () => {
    await loadSW();
    expect(mockOnMessageListener).toHaveBeenCalled();
  });

  it('should register onInstalled listener on boot', async () => {
    await loadSW();
    expect(mockOnInstalledListener).toHaveBeenCalled();
  });

  it('should load tab statuses from storage on boot', async () => {
    mockStorageGet.mockImplementation((key: string) => {
      if (key === 'tabStatuses') return Promise.resolve({ tabStatuses: {} });
      return Promise.resolve({});
    });
    await loadSW();
    // init() calls loadTabStatuses() which calls storage.get
    expect(mockStorageGet).toHaveBeenCalled();
  });

  it('should handle GET_STATUS with no DeepSeek tab', async () => {
    await loadSW();
    const listener = mockOnMessageListener.mock.calls[0][0];
    mockTabsQuery.mockResolvedValue([]);

    const response = await listener({ type: 'GET_STATUS' }, { tab: null });
    expect(response.success).toBe(true);
    expect(response.data.status).toBe('IDLE');
  });

  it('should handle GET_INSTRUCTIONS with defaults', async () => {
    mockStorageGet.mockImplementation((key: string) => {
      if (key === 'instructions') return Promise.resolve({});
      if (key === 'tabStatuses') return Promise.resolve({ tabStatuses: {} });
      return Promise.resolve({});
    });
    await loadSW();
    const listener = mockOnMessageListener.mock.calls[0][0];

    const response = await listener({ type: 'GET_INSTRUCTIONS' }, {});
    expect(response.success).toBe(true);
    expect(response.data.instructions).toBeDefined();
    expect(Array.isArray(response.data.instructions)).toBe(true);
  });

  it('should handle SAVE_INSTRUCTION', async () => {
    mockStorageGet.mockImplementation(() => Promise.resolve({ instructions: [] }));
    await loadSW();
    const listener = mockOnMessageListener.mock.calls[0][0];

    const response = await listener({
      type: 'SAVE_INSTRUCTION',
      payload: {
        instruction: {
          id: 'test-1', category: '通用', title: 'Test',
          text: 'Test text', autoSend: false, enabled: true,
          order: 1, showInContextMenu: false,
        },
      },
    }, {});
    expect(response.success).toBe(true);
    expect(mockStorageSet).toHaveBeenCalled();
  });

  it('should handle DELETE_INSTRUCTION', async () => {
    mockStorageGet.mockImplementation(() => Promise.resolve({
      instructions: [{ id: 'del-1', title: 'Delete me', text: 'x', category: '通用', autoSend: false, enabled: true, order: 1, showInContextMenu: false }],
    }));
    await loadSW();
    const listener = mockOnMessageListener.mock.calls[0][0];

    const response = await listener({ type: 'DELETE_INSTRUCTION', payload: { id: 'del-1' } }, {});
    expect(response.success).toBe(true);
    expect(mockStorageSet).toHaveBeenCalled();
  });

  it('should handle OPEN_DEEPSEEK by creating tab', async () => {
    mockTabsQuery.mockResolvedValue([]);
    mockTabsCreate.mockResolvedValue({ id: 42 });
    await loadSW();
    const listener = mockOnMessageListener.mock.calls[0][0];

    const response = await listener({ type: 'OPEN_DEEPSEEK' }, {});
    expect(response.success).toBe(true);
    expect(mockTabsCreate).toHaveBeenCalledWith({ url: 'https://chat.deepseek.com', active: true });
  });

  it('should handle OPEN_DEEPSEEK by reusing existing tab', async () => {
    mockTabsQuery.mockResolvedValue([{ id: 42, windowId: 1 }]);
    mockTabsUpdate.mockResolvedValue({});
    mockWindowsUpdate.mockResolvedValue({});
    await loadSW();
    const listener = mockOnMessageListener.mock.calls[0][0];

    const response = await listener({ type: 'OPEN_DEEPSEEK' }, {});
    expect(response.success).toBe(true);
    expect(mockTabsUpdate).toHaveBeenCalled();
  });

  it('should handle EXECUTE_INSTRUCTION with ready tab', async () => {
    mockStorageGet.mockImplementation(() => Promise.resolve({
      instructions: [{ id: 'exec-1', title: 'Execute', text: 'Do it', category: '通用', autoSend: false, enabled: true, order: 1, showInContextMenu: false }],
    }));
    mockTabsQuery.mockResolvedValue([{ id: 42, windowId: 1 }]);
    mockTabsUpdate.mockResolvedValue({});
    mockWindowsUpdate.mockResolvedValue({});
    // Content script responds immediately
    mockTabsSendMessage.mockResolvedValue({ success: true, data: { status: 'success' } });
    await loadSW();
    const listener = mockOnMessageListener.mock.calls[0][0];

    const response = await listener({ type: 'EXECUTE_INSTRUCTION', payload: { instructionId: 'exec-1' } }, {});
    expect(response.success).toBe(true);
  });

  it('should handle EXECUTE_INSTRUCTION with missing instruction', async () => {
    mockStorageGet.mockImplementation(() => Promise.resolve({ instructions: [] }));
    await loadSW();
    const listener = mockOnMessageListener.mock.calls[0][0];

    const response = await listener({ type: 'EXECUTE_INSTRUCTION', payload: { instructionId: 'nonexistent' } }, {});
    expect(response.success).toBe(false);
    expect(response.error).toBe('指令不存在');
  });

  it('should handle STATUS_CHANGE from content script', async () => {
    await loadSW();
    const listener = mockOnMessageListener.mock.calls[0][0];

    const response = await listener({
      type: 'STATUS_CHANGE',
      payload: { status: 'GENERATING' },
    }, { tab: { id: 42 } });
    expect(response.success).toBe(true);
  });

  it('should handle CONTENT_SCRIPT_READY', async () => {
    await loadSW();
    const listener = mockOnMessageListener.mock.calls[0][0];

    const response = await listener({ type: 'CONTENT_SCRIPT_READY' }, { tab: { id: 42 } });
    expect(response.success).toBe(true);
  });

  it('should handle DISCONNECT', async () => {
    await loadSW();
    const listener = mockOnMessageListener.mock.calls[0][0];

    const response = await listener({ type: 'DISCONNECT' }, { tab: { id: 42 } });
    expect(response.success).toBe(true);
  });

  it('should handle BATCH_OPERATIONS enable', async () => {
    mockStorageGet.mockImplementation(() => Promise.resolve({
      instructions: [{ id: 'b1', title: 'x', text: 'x', category: '通用', autoSend: false, enabled: false, order: 1, showInContextMenu: false }],
    }));
    await loadSW();
    const listener = mockOnMessageListener.mock.calls[0][0];

    const response = await listener({
      type: 'BATCH_OPERATIONS',
      payload: { operation: 'enable', ids: ['b1'] },
    }, {});
    expect(response.success).toBe(true);
  });

  it('should handle BATCH_OPERATIONS disable', async () => {
    mockStorageGet.mockImplementation(() => Promise.resolve({
      instructions: [{ id: 'b2', title: 'x', text: 'x', category: '通用', autoSend: false, enabled: true, order: 1, showInContextMenu: false }],
    }));
    await loadSW();
    const listener = mockOnMessageListener.mock.calls[0][0];

    const response = await listener({
      type: 'BATCH_OPERATIONS',
      payload: { operation: 'disable', ids: ['b2'] },
    }, {});
    expect(response.success).toBe(true);
  });

  it('should handle BATCH_OPERATIONS delete', async () => {
    mockStorageGet.mockImplementation(() => Promise.resolve({
      instructions: [{ id: 'b3', title: 'x', text: 'x', category: '通用', autoSend: false, enabled: true, order: 1, showInContextMenu: false }],
    }));
    await loadSW();
    const listener = mockOnMessageListener.mock.calls[0][0];

    const response = await listener({
      type: 'BATCH_OPERATIONS',
      payload: { operation: 'delete', ids: ['b3'] },
    }, {});
    expect(response.success).toBe(true);
  });

  it('should handle IMPORT_INSTRUCTIONS', async () => {
    mockStorageGet.mockImplementation(() => Promise.resolve({ instructions: [] }));
    await loadSW();
    const listener = mockOnMessageListener.mock.calls[0][0];

    const response = await listener({
      type: 'IMPORT_INSTRUCTIONS',
      payload: { instructions: [{ id: 'imp-1', title: 'Imported', text: 'x', category: '通用', autoSend: false, enabled: true, order: 1, showInContextMenu: false }] },
    }, {});
    expect(response.success).toBe(true);
    expect(mockStorageSet).toHaveBeenCalled();
  });

  it('should handle EXPORT_INSTRUCTIONS', async () => {
    mockStorageGet.mockImplementation(() => Promise.resolve({
      instructions: [{ id: 'exp-1', title: 'Export', text: 'x', category: '通用', autoSend: false, enabled: true, order: 1, showInContextMenu: false }],
    }));
    await loadSW();
    const listener = mockOnMessageListener.mock.calls[0][0];

    const response = await listener({ type: 'EXPORT_INSTRUCTIONS' }, {});
    expect(response.success).toBe(true);
    expect(response.data.instructions).toHaveLength(1);
  });

  it('should handle RESTORE_DEFAULT', async () => {
    await loadSW();
    const listener = mockOnMessageListener.mock.calls[0][0];

    const response = await listener({ type: 'RESTORE_DEFAULT' }, {});
    expect(response.success).toBe(true);
    expect(mockStorageSet).toHaveBeenCalled();
  });

  it('should handle GOAL_START and GOAL_STOP', async () => {
    mockStorageGet.mockImplementation(() => Promise.resolve({
      instructions: [{ id: 'g1', title: 'Goal', text: 'Goal text', category: '通用', autoSend: false, enabled: true, order: 1, showInContextMenu: false }],
    }));
    mockTabsQuery.mockResolvedValue([{ id: 42, windowId: 1 }]);
    mockTabsUpdate.mockResolvedValue({});
    mockWindowsUpdate.mockResolvedValue({});
    mockTabsSendMessage.mockResolvedValue({ success: true, data: { status: 'success' } });
    await loadSW();
    const listener = mockOnMessageListener.mock.calls[0][0];

    // Start goal
    const startResp = await listener({
      type: 'GOAL_START',
      payload: {
        config: {
          instructionIds: ['g1'],
          targetString: 'complete',
          maxRounds: 1,
        },
      },
    }, {});
    expect(startResp.success).toBe(true);

    // Stop goal
    const stopResp = await listener({ type: 'GOAL_STOP' }, {});
    expect(stopResp.success).toBe(true);

    // Check status
    const statusResp = await listener({ type: 'GOAL_STATUS' }, {});
    expect(statusResp.success).toBe(true);
    expect(statusResp.data.running).toBe(false);
  });

  it('should handle unknown message type', async () => {
    await loadSW();
    const listener = mockOnMessageListener.mock.calls[0][0];

    const response = await listener({ type: 'UNKNOWN_TYPE' }, {});
    expect(response.success).toBe(false);
    expect(response.error).toBe('未知消息类型');
  });

  it('should create context menus on extension install', async () => {
    await loadSW();
    // Trigger onInstalled
    const installedCb = mockOnInstalledListener.mock.calls[0][0];
    await installedCb();

    expect(mockContextMenusRemoveAll).toHaveBeenCalled();
  });

  it('should clean up tab status on tab removed', async () => {
    await loadSW();
    const removedCb = mockTabsOnRemoved.mock.calls[0][0];

    // First set a tab status
    const listener = mockOnMessageListener.mock.calls[0][0];
    await listener({ type: 'STATUS_CHANGE', payload: { status: 'GENERATING' } }, { tab: { id: 42 } });

    // Then trigger tab removal
    removedCb(42);
    expect(mockActionSetBadgeText).toHaveBeenCalledWith({ tabId: 42, text: '' });
  });

  it('should update context menus on context menu click', async () => {
    await loadSW();
    const clickedCb = mockContextMenusOnClicked.mock.calls[0][0];

    mockTabsSendMessage.mockResolvedValue({ success: true });
    mockTabsQuery.mockResolvedValue([{ id: 42, windowId: 1 }]);

    // Click on parent menu item (send-to-deepseek)
    clickedCb({ menuItemId: 'send-to-deepseek', selectionText: 'selected text' }, { id: 42 });
    expect(mockTabsSendMessage).toHaveBeenCalled();
  });
});
