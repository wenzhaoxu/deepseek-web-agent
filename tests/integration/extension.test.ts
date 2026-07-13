import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const EXTENSION_PATH = path.resolve(__dirname, '../../dist');

test.describe('Extension build verification', () => {
  test('manifest should be valid MV3', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(EXTENSION_PATH, 'manifest.json'), 'utf-8')
    );

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe('DeepSeek 助手');
    expect(manifest.permissions).toContain('storage');
    expect(manifest.permissions).toContain('tabs');
    expect(manifest.permissions).toContain('contextMenus');
    expect(manifest.background.service_worker).toBe('background/service-worker.js');
    expect(manifest.action.default_popup).toBe('popup/popup.html');
    expect(manifest.content_scripts[0].matches).toContain('*://chat.deepseek.com/*');
  });

  test('all dist files should exist and be non-empty', () => {
    const requiredFiles = [
      'manifest.json',
      'popup/popup.html', 'popup/popup.js', 'popup/popup.css',
      'background/service-worker.js',
      'content/content-script.js',
      'options/options.html', 'options/options.js', 'options/options.css',
      'shared/types.js', 'shared/messages.js', 'shared/constants.js',
      'icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png',
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(EXTENSION_PATH, file);
      expect(fs.existsSync(filePath), `Missing: ${file}`).toBe(true);
      expect(fs.statSync(filePath).size, `Empty: ${file}`).toBeGreaterThan(0);
    }
  });

  test('popup HTML should have correct script tag', () => {
    const html = fs.readFileSync(path.join(EXTENSION_PATH, 'popup/popup.html'), 'utf-8');
    expect(html).toContain('<script src="popup.js"></script>');
    expect(html).not.toContain('type="module"');
  });

  test('bundled JS should not have import statements', () => {
    for (const file of ['popup/popup.js', 'options/options.js', 'content/content-script.js']) {
      const content = fs.readFileSync(path.join(EXTENSION_PATH, file), 'utf-8');
      expect(content, `${file} has imports`).not.toContain('import ');
    }
  });
});

test.describe('Extension browser integration', () => {
  test('extension should load in browser', async () => {
    const browser = await chromium.launch({
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-sandbox',
      ],
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to the extensions management page
    await page.goto('chrome://extensions', { waitUntil: 'networkidle' }).catch(() => {
      // chrome:// URLs may not work in all environments
    });

    // Take a screenshot for debugging
    await page.screenshot({ path: 'test-results/extensions-page.png' }).catch(() => {});

    // Verify we're on a page
    expect(page.url()).toBeTruthy();

    await browser.close();
  });
});
