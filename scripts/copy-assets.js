// Copy static assets (HTML, CSS, JSON, PNG) from src/ to dist/
// Avoids copying .ts files since tsc handles those
const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '..', 'src');
const dist = path.resolve(__dirname, '..', 'dist');

const ASSET_EXT = new Set(['.html', '.css', '.json', '.png', '.svg']);

function copyAssets(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const srcPath = path.join(dir, entry.name);
    const relPath = path.relative(src, srcPath);
    const distPath = path.join(dist, relPath);
    if (entry.isDirectory()) {
      fs.mkdirSync(distPath, { recursive: true });
      copyAssets(srcPath);
    } else if (ASSET_EXT.has(path.extname(entry.name))) {
      fs.cpSync(srcPath, distPath);
    }
  }
}

fs.mkdirSync(dist, { recursive: true });
copyAssets(src);
console.log('Static assets copied to dist/');
