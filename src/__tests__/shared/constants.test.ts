import { describe, it, expect } from 'vitest';
import { INPUT_SELECTORS, SELECTORS, STORAGE_KEYS, STATUS_CONFIG, DEFAULT_INSTRUCTIONS, DEFAULT_SETTINGS } from '../../shared/constants.js';

describe('INPUT_SELECTORS', () => {
  it('should have at least one selector', () => {
    expect(INPUT_SELECTORS.length).toBeGreaterThan(0);
  });

  it('should include textarea selectors', () => {
    expect(INPUT_SELECTORS.some(s => s.includes('textarea'))).toBe(true);
  });

  it('should have a fallback to textarea', () => {
    expect(INPUT_SELECTORS).toContain('textarea');
  });
});

describe('SELECTORS', () => {
  it('should have SEND_BUTTON selector', () => {
    expect(SELECTORS.SEND_BUTTON).toBeTruthy();
  });

  it('should have STOP_BUTTON selector', () => {
    expect(SELECTORS.STOP_BUTTON).toBeTruthy();
  });

  it('should have SUBMIT_BUTTON selector', () => {
    expect(SELECTORS.SUBMIT_BUTTON).toBeTruthy();
  });
});

describe('STORAGE_KEYS', () => {
  it('should have INSTRUCTIONS key', () => {
    expect(STORAGE_KEYS.INSTRUCTIONS).toBe('instructions');
  });

  it('should have SETTINGS key', () => {
    expect(STORAGE_KEYS.SETTINGS).toBe('settings');
  });
});

describe('STATUS_CONFIG', () => {
  it('should have a debounce time', () => {
    expect(STATUS_CONFIG.DEBOUNCE_MS).toBeGreaterThan(0);
  });

  it('should have a page load timeout', () => {
    expect(STATUS_CONFIG.PAGE_LOAD_TIMEOUT_MS).toBeGreaterThan(0);
  });
});

describe('DEFAULT_INSTRUCTIONS', () => {
  it('should have exactly 10 default instructions', () => {
    expect(DEFAULT_INSTRUCTIONS).toHaveLength(10);
  });

  it('each instruction should have required fields', () => {
    for (const inst of DEFAULT_INSTRUCTIONS) {
      expect(inst.id).toBeTruthy();
      expect(inst.title).toBeTruthy();
      expect(inst.text).toBeTruthy();
      expect(inst.category).toBeTruthy();
      expect(typeof inst.autoSend).toBe('boolean');
      expect(typeof inst.enabled).toBe('boolean');
      expect(typeof inst.order).toBe('number');
    }
  });

  it('should be sorted by order', () => {
    for (let i = 1; i < DEFAULT_INSTRUCTIONS.length; i++) {
      expect(DEFAULT_INSTRUCTIONS[i].order).toBeGreaterThan(DEFAULT_INSTRUCTIONS[i - 1].order);
    }
  });

  it('each instruction should have unique id', () => {
    const ids = DEFAULT_INSTRUCTIONS.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should include summary, translate, code and other categories', () => {
    const categories = DEFAULT_INSTRUCTIONS.map(i => i.category);
    expect(categories).toContain('通用');
    expect(categories).toContain('编程');
    expect(categories).toContain('写作');
  });
});

describe('DEFAULT_SETTINGS', () => {
  it('should have defaultAutoSend false', () => {
    expect(DEFAULT_SETTINGS.defaultAutoSend).toBe(false);
  });
});
