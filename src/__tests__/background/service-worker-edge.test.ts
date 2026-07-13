import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendMessage = vi.fn();
const mockStorageGet = vi.fn();
const mockStorageSet = vi.fn();
const mockAddListener = vi.fn();
const mockInstalled = vi.fn();
const mockTabsQuery = vi.fn();
const mockTabsCreate = vi.fn();
const mockTabsUpdate = vi.fn();
const mockTabsSend = vi.fn();
const mockTabsRemoved = vi.fn();
const mockTabsUpdated = vi.fn();
const mockWinUpdate = vi.fn();
const mockCtxRemove = vi.fn();
const mockCtxCreate = vi.fn();
const mockCtxClick = vi.fn();
const mockBadgeText = vi.fn();
const mockBadgeBg = vi.fn();

(globalThis as any).chrome = {
  storage: { local: { get: mockStorageGet, set: mockStorageSet } },
  runtime: { onMessage: { addListener: mockAddListener }, onInstalled: { addListener: mockInstalled } },
  tabs: { query: mockTabsQuery, update: mockTabsUpdate, create: mockTabsCreate, sendMessage: mockTabsSend, onRemoved: { addListener: mockTabsRemoved }, onUpdated: { addListener: mockTabsUpdated } },
  windows: { update: mockWinUpdate },
  contextMenus: { removeAll: mockCtxRemove, create: mockCtxCreate, onClicked: { addListener: mockCtxClick } },
  action: { setBadgeText: mockBadgeText, setBadgeBackgroundColor: mockBadgeBg },
};

describe('SW edge cases', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockStorageSet.mockResolvedValue(undefined);
    mockStorageGet.mockImplementation(() => Promise.resolve({ instructions: [] }));
    mockCtxRemove.mockImplementation((cb: any) => cb && setTimeout(cb, 0));
    mockTabsQuery.mockResolvedValue([{ id: 42, windowId: 1 }]);
    mockTabsUpdate.mockResolvedValue({});
    mockWinUpdate.mockResolvedValue({});
    vi.resetModules();
    await import('../../background/service-worker.js');
  });

  it('handles SAVE_INSTRUCTION for new item', async () => {
    mockStorageGet.mockImplementation(() => Promise.resolve({ instructions: [] }));
    const l = mockAddListener.mock.calls[0][0];
    const r = await l({ type: 'SAVE_INSTRUCTION', payload: { instruction: { id: 'new1', title: 'New', text: 'New', category: '通用', autoSend: false, enabled: true, order: 1, showInContextMenu: false } } }, {});
    expect(r.success).toBe(true);
  });

  it('handles SAVE_INSTRUCTION for existing item', async () => {
    mockStorageGet.mockImplementation(() => Promise.resolve({
      instructions: [{ id: 'ex1', title: 'Old', text: 'Old', category: '通用', autoSend: false, enabled: true, order: 1, showInContextMenu: false }],
    }));
    const l = mockAddListener.mock.calls[0][0];
    const r = await l({ type: 'SAVE_INSTRUCTION', payload: { instruction: { id: 'ex1', title: 'Updated', text: 'New', category: '通用', autoSend: false, enabled: true, order: 1, showInContextMenu: false } } }, {});
    expect(r.success).toBe(true);
  });

  it('handles DELETE_INSTRUCTION', async () => {
    mockStorageGet.mockImplementation(() => Promise.resolve({
      instructions: [{ id: 'del1', title: 'X', text: 'X', category: '通用', autoSend: false, enabled: true, order: 1, showInContextMenu: false }],
    }));
    const l = mockAddListener.mock.calls[0][0];
    const r = await l({ type: 'DELETE_INSTRUCTION', payload: { id: 'del1' } }, {});
    expect(r.success).toBe(true);
  });

  it('handles BATCH_OPERATIONS with unknown op', async () => {
    mockStorageGet.mockImplementation(() => Promise.resolve({
      instructions: [{ id: 'b1', title: 'X', text: 'X', category: '通用', autoSend: false, enabled: true, order: 1, showInContextMenu: false }],
    }));
    const l = mockAddListener.mock.calls[0][0];
    const r = await l({ type: 'BATCH_OPERATIONS', payload: { operation: 'unknown', ids: ['b1'] } }, {});
    expect(r.success).toBe(true);
  });

  it('handles GET_STATUS with active tab', async () => {
    const l = mockAddListener.mock.calls[0][0];
    const r = await l({ type: 'GET_STATUS' }, { tab: null });
    expect(r.success).toBe(true);
  });

  it('handles tab update navigating away from deepseek', async () => {
    // First set a status for tab 42 by sending STATUS_CHANGE
    const l = mockAddListener.mock.calls[0][0];
    await l({ type: 'STATUS_CHANGE', payload: { status: 'GENERATING' } }, { tab: { id: 42 } });

    // Now trigger tab update (navigating away)
    const cb = mockTabsUpdated.mock.calls[0][0];
    cb(42, { url: 'https://google.com' });
    expect(mockBadgeText).toHaveBeenCalledWith({ tabId: 42, text: '' });
  });

  it('handles context menu on non-existent tab', async () => {
    const cb = mockCtxClick.mock.calls[0][0];
    // Click without tab
    cb({ menuItemId: 'send-to-deepseek', selectionText: '' }, null);
    // Should not throw
  });

  it('handles GOAL_STOP when no goal running', async () => {
    const l = mockAddListener.mock.calls[0][0];
    const r = await l({ type: 'GOAL_STOP' }, {});
    expect(r.success).toBe(true);
  });

  it('handles GOAL_STATUS when no goal', async () => {
    const l = mockAddListener.mock.calls[0][0];
    const r = await l({ type: 'GOAL_STATUS' }, {});
    expect(r.success).toBe(true);
  });

  it('handles OPEN_DEEPSEEK when create tab fails', async () => {
    mockTabsQuery.mockResolvedValue([]);
    mockTabsCreate.mockResolvedValue({ id: null }); // tab without id
    const l = mockAddListener.mock.calls[0][0];
    const r = await l({ type: 'OPEN_DEEPSEEK' }, {});
    // Should handle gracefully
    expect(r).toBeDefined();
  });

  it('handles tabs.onRemoved cleanup for unknown tab', async () => {
    const cb = mockTabsRemoved.mock.calls[0][0];
    // Remove a tab not in the status map
    cb(999);
    // Should not throw
  });
});
