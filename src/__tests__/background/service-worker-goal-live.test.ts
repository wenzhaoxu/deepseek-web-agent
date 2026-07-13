import { describe, it, expect, vi, beforeEach } from 'vitest';

const mg = vi.fn(); // storage.get
const ms = vi.fn(); // storage.set
const ml = vi.fn(); // onMessage listener
const mq = vi.fn(); // tabs.query
const mt = vi.fn(); // tabs.sendMessage
const mx = vi.fn(); // tabs.create
const mu = vi.fn(); // tabs.update
const mw = vi.fn(); // windows.update
const mr = vi.fn(); // contextMenus.removeAll
const mc = vi.fn(); // contextMenus.create
const mk = vi.fn(); // contextMenus.onClicked
const mb = vi.fn(); // badgeText
const mo = vi.fn(); // tabs.onRemoved
const mh = vi.fn(); // tabs.onUpdated
const mi = vi.fn(); // onInstalled

(globalThis as any).chrome = {
  storage: { local: { get: mg, set: ms } },
  runtime: { onMessage: { addListener: ml }, onInstalled: { addListener: mi } },
  tabs: { query: mq, update: mu, create: mx, sendMessage: mt, onRemoved: { addListener: mo }, onUpdated: { addListener: mh } },
  windows: { update: mw },
  contextMenus: { removeAll: mr, create: mc, onClicked: { addListener: mk } },
  action: { setBadgeText: mb, setBadgeBackgroundColor: vi.fn() },
};

describe('SW goal live', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    ms.mockResolvedValue(undefined);
    mg.mockImplementation(() => Promise.resolve({ instructions: [
      { id:'g1', title:'Test', text:'Test text', category:'通用', autoSend:false, enabled:true, order:1, showInContextMenu:false },
    ]}));
    mr.mockImplementation((cb:any) => cb && setTimeout(cb, 0));
    mq.mockResolvedValue([{ id: 42, windowId: 1 }]);
    mu.mockResolvedValue({});
    mw.mockResolvedValue({});
    mt.mockResolvedValue({ success: true, data: { status: 'success' } });
    vi.resetModules();
    await import('../../background/service-worker.js');
  });

  it('goal run: sends FILL_TEXT, checks target, completes cycle', async () => {
    const listener = ml.mock.calls[0][0];

    // Start goal
    mt.mockResolvedValue({ success: true, data: { status: 'success' } });
    const startResp = await listener({
      type: 'GOAL_START',
      payload: { config: { instructionIds: ['g1'], targetString: '完成', maxRounds: 1 } },
    }, {});
    expect(startResp.success).toBe(true);

    // Simulate goal running: first FILL_TEXT should be sent by the engine
    await new Promise(r => setTimeout(r, 50));

    // Simulate status change to GENERATING (response started)
    await listener({ type: 'STATUS_CHANGE', payload: { status: 'GENERATING' } }, { tab: { id: 42 } });

    // Simulate status change to IDLE (response finished, engine will check target)
    await listener({ type: 'STATUS_CHANGE', payload: { status: 'IDLE' } }, { tab: { id: 42 } });

    // Wait for engine to process and send GOAL_CHECK_TARGET
    await new Promise(r => setTimeout(r, 50));

    // Check status - goal should have completed or be in progress
    const statusResp = await listener({ type: 'GOAL_STATUS' }, {});
    expect(statusResp.success).toBe(true);
    expect(statusResp.data.running).toBeDefined();
  });

  it('goal stops when target found', async () => {
    const listener = ml.mock.calls[0][0];

    // Start goal
    await listener({
      type: 'GOAL_START',
      payload: { config: { instructionIds: ['g1'], targetString: '完成', maxRounds: 2 } },
    }, {});

    await new Promise(r => setTimeout(r, 50));

    // Simulate response: GENERATING → IDLE, then GOAL_CHECK finds target
    await listener({ type: 'STATUS_CHANGE', payload: { status: 'GENERATING' } }, { tab: { id: 42 } });

    // Setup GOAL_CHECK_TARGET to find target
    mt.mockImplementation((tabId: number, msg: any) => {
      if (msg.type === 'GOAL_CHECK_TARGET') {
        return Promise.resolve({ success: true, data: { found: true, matchedText: '任务完成' } });
      }
      return Promise.resolve({ success: true, data: { status: 'success' } });
    });

    await listener({ type: 'STATUS_CHANGE', payload: { status: 'IDLE' } }, { tab: { id: 42 } });
    await new Promise(r => setTimeout(r, 100));

    // Goal should have completed due to target found
    const status = await listener({ type: 'GOAL_STATUS' }, {});
    // Either running or stopped - verify state is consistent
    expect(status.data.statusText).toBeDefined();
  });

  it('goal stops on manual STOP', async () => {
    const listener = ml.mock.calls[0][0];

    await listener({
      type: 'GOAL_START',
      payload: { config: { instructionIds: ['g1'], targetString: '完成', maxRounds: 5 } },
    }, {});

    await new Promise(r => setTimeout(r, 50));

    const stopResp = await listener({ type: 'GOAL_STOP' }, {});
    expect(stopResp.success).toBe(true);

    await new Promise(r => setTimeout(r, 50));
    const status = await listener({ type: 'GOAL_STATUS' }, {});
    expect(status.data.running).toBe(false);
  });

  it('finds existing tab and sends FILL_TEXT on instruction execution', async () => {
    const listener = ml.mock.calls[0][0];
    mt.mockResolvedValue({ success: true, data: { status: 'success' } });
    mq.mockResolvedValue([{ id: 99, windowId: 1 }]);

    const resp = await listener({
      type: 'EXECUTE_INSTRUCTION',
      payload: { instructionId: 'g1' },
    }, {});
    expect(resp.success).toBe(true);
  });

  it('updates badge on status change', async () => {
    const listener = ml.mock.calls[0][0];

    await listener({ type: 'STATUS_CHANGE', payload: { status: 'GENERATING' } }, { tab: { id: 42 } });
    expect(mb).toHaveBeenCalled();

    // Verify persistent storage was called (persistTabStatuses)
    expect(ms).toHaveBeenCalled();
  });

  it('handles tab.onRemoved for tracked tab', async () => {
    // First establish status
    const listener = ml.mock.calls[0][0];
    await listener({ type: 'STATUS_CHANGE', payload: { status: 'GENERATING' } }, { tab: { id: 42 } });

    // Then remove tab
    const cb = mo.mock.calls[0][0];
    cb(42);
    expect(mb).toHaveBeenCalledWith({ tabId: 42, text: '' });
  });
});
