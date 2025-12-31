const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const exclude = [
  'node_modules',
  '.next',
  'frontend/.next',
  'frontend/node_modules',
  '.git',
  'scripts',
  'test',
  '__tests__',
  'frontend/test',
];

function walk(dir) {
  const results = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(repoRoot, full);
    if (exclude.some(e => rel.split(path.sep).includes(e))) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) results.push(...walk(full));
    else results.push(full);
  }
  return results;
}

const files = walk(repoRoot);
const patterns = [
  { re: /dangerouslySetInnerHTML/, msg: 'dangerouslySetInnerHTML used' },
  { re: /\.innerHTML/, msg: 'innerHTML used' },
  { re: /xlink:href\s*=\s*"https?:/, msg: 'external xlink:href' },
  { re: /href\s*=\s*"https?:/, msg: 'external href' },
];

let found = false;
for (const f of files) {
  const ext = path.extname(f).toLowerCase();
  if (!['.js', '.ts', '.jsx', '.tsx', '.html', '.svg'].includes(ext)) continue;
  let content = '';
  try { content = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
  for (const p of patterns) {
    if (p.re.test(content)) {
      console.error(`${p.msg}: ${path.relative(repoRoot, f)}`);
      found = true;
    }
  }
}
if (found) process.exit(1);
console.log('No security patterns found.');
