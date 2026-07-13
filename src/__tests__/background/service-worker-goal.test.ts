import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all chrome APIs needed for Goal engine tests
const mockSendMessage = vi.fn();
const mockStorageGet = vi.fn();
const mockStorageSet = vi.fn();
const mockAddListener = vi.fn();
const mockTabsQuery = vi.fn();
const mockTabsUpdate = vi.fn();
const mockTabsCreate = vi.fn();
const mockTabsSend = vi.fn();
const mockWinUpdate = vi.fn();
const mockCtxRemoveAll = vi.fn();
const mockCtxCreate = vi.fn();
const mockCtxOnClicked = vi.fn();
const mockBadgeText = vi.fn();
const mockBadgeBg = vi.fn();
const mockOnRemoved = vi.fn();
const mockOnUpdated = vi.fn();
const mockOnInstalled = vi.fn();

(globalThis as any).chrome = {
  storage: { local: { get: mockStorageGet, set: mockStorageSet } },
  runtime: { onMessage: { addListener: mockAddListener }, onInstalled: { addListener: mockOnInstalled }, id: 'test' },
  tabs: { query: mockTabsQuery, update: mockTabsUpdate, create: mockTabsCreate, sendMessage: mockTabsSend, onRemoved: { addListener: mockOnRemoved }, onUpdated: { addListener: mockOnUpdated } },
  windows: { update: mockWinUpdate },
  contextMenus: { removeAll: mockCtxRemoveAll, create: mockCtxCreate, onClicked: { addListener: mockCtxOnClicked } },
  action: { setBadgeText: mockBadgeText, setBadgeBackgroundColor: mockBadgeBg },
};

describe('Service Worker - Goal Engine', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockStorageGet.mockReset();
    mockStorageSet.mockReset();
    mockStorageSet.mockResolvedValue(undefined); // persistTabStatuses uses .catch()
    mockTabsQuery.mockReset();
    mockTabsSend.mockReset();
    mockCtxRemoveAll.mockImplementation((cb: any) => cb && setTimeout(cb, 0));

    // Default: instructions in storage
    mockStorageGet.mockImplementation((key: string) => {
      if (key === 'instructions' || key === 'instructions' as any) {
        return Promise.resolve({
          instructions: [{
            id: 'g1', title: '测试指令', text: '请分析以下内容', category: '通用',
            autoSend: false, enabled: true, order: 1, showInContextMenu: false,
          }],
        });
      }
      return Promise.resolve({});
    });
    mockTabsQuery.mockResolvedValue([{ id: 42, windowId: 1 }]);
    mockTabsUpdate.mockResolvedValue({});
    mockWinUpdate.mockResolvedValue({});
  });

  it('GOAL_START should reject if already running', async () => {
    vi.resetModules();
    await import('../../background/service-worker.js');
    const listener = mockAddListener.mock.calls[0][0];

    // First start
    mockTabsSend.mockResolvedValue({ success: true, data: { status: 'success' } });
    const r1 = await listener({ type: 'GOAL_START', payload: { config: { instructionIds: ['g1'], targetString: '完成', maxRounds: 1 } } }, {});
    expect(r1.success).toBe(true);

    // Second start should be rejected
    const r2 = await listener({ type: 'GOAL_START', payload: { config: { instructionIds: ['g1'], targetString: '完成', maxRounds: 1 } } }, {});
    expect(r2.success).toBe(false);
    expect(r2.error).toContain('正在运行');
  });

  it('GOAL_STATUS should return current state', async () => {
    // Need fresh module
    vi.resetModules();
    await import('../../background/service-worker.js');
    const listener = mockAddListener.mock.calls[0][0];

    await listener({ type: 'GOAL_START', payload: { config: { instructionIds: ['g1'], targetString: '完成', maxRounds: 3 } } }, {});

    const status = await listener({ type: 'GOAL_STATUS' }, {});
    expect(status.success).toBe(true);
    expect(status.data.running).toBeDefined();
    expect(typeof status.data.currentRound).toBe('number');
    expect(typeof status.data.currentInstructionIndex).toBe('number');
  });

  it('GOAL should stop on manual STOP', async () => {
    vi.resetModules();
    await import('../../background/service-worker.js');
    const listener = mockAddListener.mock.calls[0][0];

    mockTabsSend.mockRejectedValue(new Error('Not ready'));
    await listener({ type: 'GOAL_START', payload: { config: { instructionIds: ['g1'], targetString: '完成', maxRounds: 5 } } }, {});

    await listener({ type: 'GOAL_STOP' }, {});
    const status = await listener({ type: 'GOAL_STATUS' }, {});
    expect(status.data.running).toBe(false);
    expect(status.data.statusText).toBe('已停止');
  });
});
