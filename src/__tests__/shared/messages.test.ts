import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome runtime before importing the module
const mockSendMessage = vi.fn();
(globalThis as any).chrome = {
  runtime: {
    sendMessage: mockSendMessage,
  },
  tabs: {
    sendMessage: vi.fn(),
  },
};

// Import after mocks are set up
import { createMessage, sendMessage, sendMessageToTab, createSuccessResponse, createErrorResponse } from '../../shared/messages.js';
import { MessageType } from '../../shared/types.js';

describe('createMessage', () => {
  it('should create a message with type and payload', () => {
    const msg = createMessage(MessageType.GET_STATUS, { foo: 'bar' });
    expect(msg).toEqual({ type: MessageType.GET_STATUS, payload: { foo: 'bar' } });
  });

  it('should create a message without payload', () => {
    const msg = createMessage(MessageType.GET_STATUS);
    expect(msg).toEqual({ type: MessageType.GET_STATUS, payload: undefined });
  });

  it('should handle all message types', () => {
    for (const type of Object.values(MessageType)) {
      const msg = createMessage(type as MessageType);
      expect(msg.type).toBe(type);
    }
  });
});

describe('createSuccessResponse', () => {
  it('should create success response with data', () => {
    const resp = createSuccessResponse({ hello: 'world' });
    expect(resp).toEqual({ success: true, data: { hello: 'world' } });
  });

  it('should handle null data', () => {
    const resp = createSuccessResponse(null);
    expect(resp.success).toBe(true);
    expect(resp.data).toBeNull();
  });
});

describe('createErrorResponse', () => {
  it('should create error response with message', () => {
    const resp = createErrorResponse('something went wrong');
    expect(resp).toEqual({ success: false, error: 'something went wrong' });
  });

  it('should handle empty error string', () => {
    const resp = createErrorResponse('');
    expect(resp.success).toBe(false);
    expect(resp.error).toBe('');
  });
});

describe('sendMessage', () => {
  beforeEach(() => {
    mockSendMessage.mockReset();
  });

  it('should call chrome.runtime.sendMessage with the message', () => {
    const msg = createMessage(MessageType.GET_STATUS);
    sendMessage(msg);
    expect(mockSendMessage).toHaveBeenCalledWith(msg);
  });

  it('should return the response from chrome.runtime.sendMessage', async () => {
    const expected = { success: true, data: { status: 'IDLE' } };
    mockSendMessage.mockResolvedValue(expected);
    const msg = createMessage(MessageType.GET_STATUS);
    const result = await sendMessage(msg);
    expect(result).toEqual(expected);
  });

  it('should propagate errors from chrome.runtime.sendMessage', async () => {
    const error = new Error('Connection failed');
    mockSendMessage.mockRejectedValue(error);
    const msg = createMessage(MessageType.GET_STATUS);
    await expect(sendMessage(msg)).rejects.toThrow('Connection failed');
  });
});

describe('sendMessageToTab', () => {
  const mockTabSendMessage = vi.fn();

  beforeEach(() => {
    mockTabSendMessage.mockReset();
    (globalThis as any).chrome.tabs.sendMessage = mockTabSendMessage;
  });

  it('should call chrome.tabs.sendMessage with tabId and message', () => {
    const msg = createMessage(MessageType.FILL_TEXT, { text: 'hello' });
    sendMessageToTab(123, msg);
    expect(mockTabSendMessage).toHaveBeenCalledWith(123, msg);
  });

  it('should return the response from tabs.sendMessage', async () => {
    const expected = { success: true, data: { status: 'success' } };
    mockTabSendMessage.mockResolvedValue(expected);
    const msg = createMessage(MessageType.FILL_TEXT, { text: 'hello' });
    const result = await sendMessageToTab(123, msg);
    expect(result).toEqual(expected);
  });
});
