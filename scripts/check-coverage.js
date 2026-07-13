const fs = require('fs');
const data = JSON.parse(fs.readFileSync('coverage/coverage-final.json', 'utf-8'));
let totalStmts = 0, totalCovered = 0;
for (const [path, info] of Object.entries(data)) {
  if (!path.endsWith('.ts')) continue;
  const stmts = info.s || {};
  const total = Object.keys(stmts).length;
  const covered = Object.values(stmts).filter(v => v > 0).length;
  const pct = total > 0 ? ((covered / total) * 100).toFixed(0) : 'N/A';
  const name = path.split('\\').pop() || path.split('/').pop() || path;
  console.log(name.padEnd(35) + ' ' + covered + '/' + total + ' (' + pct + '%)');
  totalStmts += total;
  totalCovered += covered;
}
console.log('-'.repeat(50));
const overall = (totalCovered / totalStmts * 100).toFixed(0);
console.log('TOTAL'.padEnd(35) + ' ' + totalCovered + '/' + totalStmts + ' (' + overall + '%)');
