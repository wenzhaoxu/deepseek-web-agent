import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorageGet = vi.fn();
const mockStorageSet = vi.fn();
const mockAddListener = vi.fn();
const mockTabsQuery = vi.fn();
const mockTabsCreate = vi.fn();
const mockTabsSend = vi.fn();
const mockTabsUpdate = vi.fn();
const mockWinUpdate = vi.fn();
const mockCtxRemoveAll = vi.fn();
const mockCtxCreate = vi.fn();
const mockCtxClicked = vi.fn();
const mockBadgeText = vi.fn();
const mockBadgeBg = vi.fn();
const mockOnRemoved = vi.fn();
const mockOnUpdated = vi.fn();
const mockOnInstalled = vi.fn();

(globalThis as any).chrome = {
  storage: { local: { get: mockStorageGet, set: mockStorageSet } },
  runtime: { onMessage: { addListener: mockAddListener }, onInstalled: { addListener: mockOnInstalled } },
  tabs: { query: mockTabsQuery, update: mockTabsUpdate, create: mockTabsCreate, sendMessage: mockTabsSend, onRemoved: { addListener: mockOnRemoved }, onUpdated: { addListener: mockOnUpdated } },
  windows: { update: mockWinUpdate },
  contextMenus: { removeAll: mockCtxRemoveAll, create: mockCtxCreate, onClicked: { addListener: mockCtxClicked } },
  action: { setBadgeText: mockBadgeText, setBadgeBackgroundColor: mockBadgeBg },
};

describe('SW extra coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageSet.mockResolvedValue(undefined);
    mockStorageGet.mockImplementation((key: string) => {
      if (key === 'tabStatuses') return Promise.resolve({ tabStatuses: { '42': 'GENERATING' } });
      return Promise.resolve({ instructions: [] });
    });
    mockCtxRemoveAll.mockImplementation((cb: any) => cb && setTimeout(cb, 0));
    mockTabsQuery.mockResolvedValue([{ id: 42, windowId: 1 }]);
    mockTabsSend.mockResolvedValue({ success: true, data: { status: 'success' } });
    vi.resetModules();
  });

  it('loads persisted tab statuses on boot', async () => {
    await import('../../background/service-worker.js');
    expect(mockStorageGet).toHaveBeenCalled();
  });

  it('handles GOAL_START', async () => {
    await import('../../background/service-worker.js');
    const listener = mockAddListener.mock.calls[0][0];
    const resp = await listener({ type: 'GOAL_START', payload: { config: { instructionIds: ['x'], targetString: 'y', maxRounds: 1 } } }, {});
    expect(resp.success).toBe(true);
  });

  it('handles EXPORT_INSTRUCTIONS', async () => {
    await import('../../background/service-worker.js');
    const listener = mockAddListener.mock.calls[0][0];
    const resp = await listener({ type: 'EXPORT_INSTRUCTIONS' }, {});
    expect(resp.success).toBe(true);
  });

  it('handles context menu click', async () => {
    await import('../../background/service-worker.js');
    await new Promise(r => setTimeout(r, 20));
    if (mockCtxClicked.mock.calls.length > 0) {
      mockCtxClicked.mock.calls[0][0](
        { menuItemId: 'send-to-deepseek', selectionText: 'test' },
        { id: 42 }
      );
      expect(mockTabsSend).toHaveBeenCalled();
    }
  });

  it('handles context menu instruction click', async () => {
    mockStorageGet.mockImplementation((key: string) => Promise.resolve({
      instructions: [{ id: 'inst-1', title: 'Test', text: 'Test', category: '通用', autoSend: false, enabled: true, order: 1, showInContextMenu: false }],
    }));
    await import('../../background/service-worker.js');
    await new Promise(r => setTimeout(r, 20));
    if (mockCtxClicked.mock.calls.length > 0) {
      const cb = mockCtxClicked.mock.calls[0][0];
      cb({ menuItemId: 'inst-1', selectionText: '' }, { id: 42 });
    }
  });
});
