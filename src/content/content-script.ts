import { TabStatus, MessageType } from '../shared/types.js';
import type { ExtensionMessage, ExtensionResponse, FillTextPayload, FillResultPayload } from '../shared/types.js';
import { INPUT_SELECTORS, SELECTORS, STATUS_CONFIG } from '../shared/constants.js';
import { createMessage, createErrorResponse, createSuccessResponse } from '../shared/messages.js';

// State
let statusCheckTimer: ReturnType<typeof setTimeout> | null = null;
let lastReportedStatus: TabStatus | null = null;

// Set value on React-controlled input elements
function setNativeValue(element: HTMLTextAreaElement | HTMLInputElement, value: string): void {
  const nativeTextAreaSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;
  const nativeInputSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set;
  const setter = nativeTextAreaSetter ?? nativeInputSetter;

  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

// Find the chat input element
function findChatInput(): HTMLTextAreaElement | HTMLInputElement | null {
  for (const selector of INPUT_SELECTORS) {
    const el = document.querySelector<HTMLTextAreaElement | HTMLInputElement>(selector);
    if (el && (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement)) {
      return el;
    }
  }
  return null;
}

// Detect the current page status
function detectPageStatus(): TabStatus {
  if (document.querySelector(SELECTORS.STOP_BUTTON)) {
    return TabStatus.GENERATING;
  }
  const input = findChatInput();
  if (input && input.disabled) {
    return TabStatus.GENERATING;
  }
  return TabStatus.IDLE;
}

// Report status change to the service worker
function reportStatusChange(): void {
  const currentStatus = detectPageStatus();
  if (currentStatus !== lastReportedStatus) {
    lastReportedStatus = currentStatus;
    chrome.runtime.sendMessage(
      createMessage(MessageType.STATUS_CHANGE, {
        status: currentStatus,
      })
    );
  }
}

// Setup MutationObserver with debounce for DOM changes
function setupMutationObserver(): void {
  const observer = new MutationObserver(() => {
    if (statusCheckTimer) {
      clearTimeout(statusCheckTimer);
    }
    statusCheckTimer = setTimeout(reportStatusChange, STATUS_CONFIG.DEBOUNCE_MS);
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
  });
}

// Handle FILL_TEXT message from service worker
async function handleFillText(payload: FillTextPayload): Promise<ExtensionResponse<FillResultPayload>> {
  const input = findChatInput();
  if (!input) {
    console.error('[DeepSeek助手] 未找到输入框。页面输入框:', document.querySelector('textarea'));
    return createErrorResponse('未找到输入框');
  }

  console.log('[DeepSeek助手] 找到输入框:', input.placeholder, 'tag:', input.tagName);

  setNativeValue(input, payload.text);
  console.log('[DeepSeek助手] 已填入文本:', payload.text.substring(0, 30) + '...');

  return createSuccessResponse<FillResultPayload>({ status: 'success' });
}

// Setup chrome.runtime.onMessage listener
function setupMessageListener(): void {
  chrome.runtime.onMessage.addListener(
    (message, _sender, sendResponse) => {
      if (message.type === MessageType.FILL_TEXT) {
        handleFillText(message.payload as FillTextPayload)
          .then(r => sendResponse(r))
          .catch(err => sendResponse(createErrorResponse(err.message)));
        return true; // keep channel open for async response
      }
    }
  );
}

// Setup disconnect listeners for page unload
function setupDisconnectListeners(): void {
  const handleDisconnect = (): void => {
    chrome.runtime.sendMessage(createMessage(MessageType.DISCONNECT));
  };
  window.addEventListener('beforeunload', handleDisconnect);
  window.addEventListener('pagehide', handleDisconnect);
}

// Initialize the content script
function init(): void {
  console.log('[DeepSeek助手] Content Script 已加载');
  setupMessageListener();
  setupMutationObserver();
  setupDisconnectListeners();
  chrome.runtime.sendMessage(createMessage(MessageType.CONTENT_SCRIPT_READY));
  reportStatusChange();
  console.log('[DeepSeek助手] 初始化完成');
}

init();
