// Build script: compiles TS, copies static assets, bundles popup/options
// (removes ES module imports which aren't reliable in unpacked extension HTML pages)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

// ── 1. TypeScript Compile ──
console.log('Compiling TypeScript...');
execSync('npx tsc', { cwd: ROOT, stdio: 'inherit' });

// ── 2. Copy static assets ──
console.log('Copying static assets...');
const ASSET_EXT = new Set(['.html', '.css', '.json', '.png', '.svg']);
function copyAssets(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const srcPath = path.join(dir, entry.name);
    const relPath = path.relative(SRC, srcPath);
    const distPath = path.join(DIST, relPath);
    if (entry.isDirectory()) {
      fs.mkdirSync(distPath, { recursive: true });
      copyAssets(srcPath);
    } else if (ASSET_EXT.has(path.extname(entry.name))) {
      fs.cpSync(srcPath, distPath);
    }
  }
}
fs.mkdirSync(DIST, { recursive: true });
copyAssets(SRC);

// ── 3. Bundle popup.js and options.js (inline shared deps, strip module syntax) ──
console.log('Bundling popup.js and options.js...');

function bundle(target, deps) {
  const parts = [];
  for (const dep of deps) {
    const content = fs.readFileSync(path.join(DIST, dep), 'utf-8');
    // Strip all import and export lines
    const cleaned = content
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        // Remove: import ... from "..."
        if (trimmed.startsWith('import ') && trimmed.includes('from')) return false;
        // Remove: export { ... }
        if (trimmed.startsWith('export {') && trimmed.endsWith('}')) return false;
        // Remove: export default ...
        if (trimmed.startsWith('export default')) return false;
        // Keep lines that just have "export " in the middle (e.g. "export var TabStatus;" → "var TabStatus;")
        return true;
      })
      .map(line => line.replace(/\bexport\s+(var|let|const|function|class|async\s+function)\s+/g, '$1 '))
      .join('\n');
    parts.push(cleaned);
  }
  const bundle = parts.join('\n');
  fs.writeFileSync(path.join(DIST, target), bundle, 'utf-8');
}

// Strip export from any shared files that might be loaded independently too
// The concatenation order follows dependency chain:
//    types.js → messages.js → page-specific code
bundle('popup/popup.js', [
  'shared/types.js',
  'shared/messages.js',
  'popup/popup.js',
]);

bundle('options/options.js', [
  'shared/types.js',
  'shared/messages.js',
  'shared/constants.js',
  'options/options.js',
]);

// ── 4. Update HTML files to remove type="module" since bundles are plain scripts ──
for (const page of ['popup', 'options']) {
  const htmlPath = path.join(DIST, page, `${page}.html`);
  let html = fs.readFileSync(htmlPath, 'utf-8');
  html = html.replace(
    /<script\s+type="module"\s+src="(\w+\.js)">\s*<\/script>/,
    '<script src="$1"></script>'
  );
  fs.writeFileSync(htmlPath, html, 'utf-8');
}

console.log('Build complete. Full file list:');
const allFiles = fs.readdirSync(DIST, { recursive: true }).filter(f => fs.statSync(path.join(DIST, f)).isFile());
for (const f of allFiles.sort()) console.log(`  dist/${f}`);
