import { TabStatus, MessageType } from '../shared/types';
import type { ExtensionMessage, ExtensionResponse, FillTextPayload, FillResultPayload, StatusChangePayload } from '../shared/types';
import { SELECTORS, STATUS_CONFIG } from '../shared/constants';
import { createMessage, createErrorResponse, createSuccessResponse } from '../shared/messages';

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
  for (const selector of Object.values(SELECTORS)) {
    const el = document.querySelector(selector);
    if (el) {
      return el as HTMLTextAreaElement | HTMLInputElement;
    }
  }
  return document.querySelector('textarea');
}

// Trigger a send action via Enter key
function triggerSend(): void {
  document.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    })
  );
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
      createMessage<StatusChangePayload>(MessageType.STATUS_CHANGE, {
        status: currentStatus,
        tabId: 0,
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
    return createErrorResponse('未找到输入框');
  }

  setNativeValue(input, payload.text);

  if (payload.autoSend) {
    const status = detectPageStatus();
    if (status === TabStatus.IDLE) {
      input.focus();
      await new Promise<void>(r => setTimeout(r, 100));
      triggerSend();
      return createSuccessResponse<FillResultPayload>({ status: 'success' });
    }
    return createSuccessResponse<FillResultPayload>({
      status: 'warning',
      warning: '模型回复中，已填入未发送',
    });
  }

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
  setupMessageListener();
  setupMutationObserver();
  setupDisconnectListeners();
  chrome.runtime.sendMessage(createMessage(MessageType.CONTENT_SCRIPT_READY));
  reportStatusChange();
}

init();
