import type { Instruction } from './types';

// Input field selectors for chat.deepseek.com (tried in order)
export const INPUT_SELECTORS = [
  'textarea[placeholder*="消息"]',
  'textarea[name="search"]',
  '#chat-input',
  'textarea',
] as const;

// Button / element selectors for other interactions
export const SELECTORS = {
  SEND_BUTTON: 'div[role="button"]',
  STOP_BUTTON: '[data-testid="stop-button"], button:has(svg)',
  SUBMIT_BUTTON: 'button[type="submit"]',
} as const;

// Storage keys
export const STORAGE_KEYS = {
  INSTRUCTIONS: 'instructions',
  SETTINGS: 'settings',
} as const;

// Status detection config
export const STATUS_CONFIG = {
  DEBOUNCE_MS: 500,
  PAGE_LOAD_TIMEOUT_MS: 5000,
} as const;

// Default instructions
export const DEFAULT_INSTRUCTIONS: Instruction[] = [
  {
    id: '1', category: '通用', title: '总结内容',
    text: '请对以下内容进行要点总结：', autoSend: false, enabled: true, order: 1, showInContextMenu: false,
  },
  {
    id: '2', category: '语言', title: '翻译为英文',
    text: 'Translate the following into English:', autoSend: false, enabled: true, order: 2, showInContextMenu: false,
  },
  {
    id: '3', category: '编程', title: '解释代码',
    text: '请解释以下代码的功能和逻辑：', autoSend: false, enabled: true, order: 3, showInContextMenu: false,
  },
  {
    id: '4', category: '写作', title: '改写更正式',
    text: '请将以下内容改写为更正式的表达：', autoSend: false, enabled: true, order: 4, showInContextMenu: false,
  },
  {
    id: '5', category: '办公', title: '生成周报摘要',
    text: '根据以下工作记录生成周报摘要：', autoSend: false, enabled: true, order: 5, showInContextMenu: false,
  },
  {
    id: '6', category: '创意', title: '头脑风暴',
    text: '针对以下主题给出5个创新想法：', autoSend: false, enabled: true, order: 6, showInContextMenu: false,
  },
  {
    id: '7', category: '语言', title: '修复语法错误',
    text: '修正以下文本中的语法错误：', autoSend: false, enabled: true, order: 7, showInContextMenu: false,
  },
  {
    id: '8', category: '工具', title: '转换为Markdown',
    text: '将以下内容转换为Markdown格式：', autoSend: false, enabled: true, order: 8, showInContextMenu: false,
  },
  {
    id: '9', category: '学习', title: '解释专业术语',
    text: '用简单语言解释以下术语：', autoSend: false, enabled: true, order: 9, showInContextMenu: false,
  },
  {
    id: '10', category: '办公', title: '起草邮件回复',
    text: '根据邮件内容起草礼貌回复：', autoSend: false, enabled: true, order: 10, showInContextMenu: false,
  },
];

export const DEFAULT_SETTINGS = {
  defaultAutoSend: false,
} as const;
