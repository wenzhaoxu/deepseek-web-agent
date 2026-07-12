import type { ExtensionMessage, ExtensionResponse } from './types';
import { MessageType } from './types';

export function createMessage<T>(type: MessageType, payload?: T): ExtensionMessage {
  return { type, payload };
}

export function sendMessage<T = unknown>(message: ExtensionMessage): Promise<ExtensionResponse<T>> {
  return chrome.runtime.sendMessage(message);
}

export function sendMessageToTab<T = unknown>(tabId: number, message: ExtensionMessage): Promise<ExtensionResponse<T>> {
  return chrome.tabs.sendMessage(tabId, message);
}

export function createSuccessResponse<T>(data: T): ExtensionResponse<T> {
  return { success: true, data };
}

export function createErrorResponse(error: string): ExtensionResponse<never> {
  return { success: false, error };
}
