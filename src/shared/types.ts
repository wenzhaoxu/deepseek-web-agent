// Tab status
export enum TabStatus {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
}

// Instruction data model
export interface Instruction {
  id: string;
  category: string;
  title: string;
  text: string;
  autoSend: boolean;
  enabled: boolean;
  order: number;
  showInContextMenu: boolean;
}

// Message types for communication
export enum MessageType {
  // Popup → SW
  EXECUTE_INSTRUCTION = 'EXECUTE_INSTRUCTION',
  GET_INSTRUCTIONS = 'GET_INSTRUCTIONS',
  SAVE_INSTRUCTION = 'SAVE_INSTRUCTION',
  DELETE_INSTRUCTION = 'DELETE_INSTRUCTION',
  GET_STATUS = 'GET_STATUS',
  BATCH_OPERATIONS = 'BATCH_OPERATIONS',
  IMPORT_INSTRUCTIONS = 'IMPORT_INSTRUCTIONS',
  EXPORT_INSTRUCTIONS = 'EXPORT_INSTRUCTIONS',
  RESTORE_DEFAULT = 'RESTORE_DEFAULT',
  OPEN_DEEPSEEK = 'OPEN_DEEPSEEK',

  // SW → Content
  FILL_TEXT = 'FILL_TEXT',

  // Content → SW
  FILL_RESULT = 'FILL_RESULT',
  STATUS_CHANGE = 'STATUS_CHANGE',
  DISCONNECT = 'DISCONNECT',
  CONTENT_SCRIPT_READY = 'CONTENT_SCRIPT_READY',
}

// Base message interface
export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}

// Typed message payloads
export interface ExecuteInstructionPayload {
  instructionId: string;
}

export interface FillTextPayload {
  text: string;
  autoSend: boolean;
}

export interface FillResultPayload {
  status: 'success' | 'warning' | 'error';
  warning?: string;
}

export interface StatusChangePayload {
  status: TabStatus;
  tabId: number;
}

export interface SaveInstructionPayload {
  instruction: Instruction;
}

export interface DeleteInstructionPayload {
  id: string;
}

export interface BatchOperationsPayload {
  operation: 'enable' | 'disable' | 'delete';
  ids: string[];
}

// Response format
export interface ExtensionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface GetStatusResponse {
  status: TabStatus;
  tabId?: number;
}

export interface GetInstructionsResponse {
  instructions: Instruction[];
}
