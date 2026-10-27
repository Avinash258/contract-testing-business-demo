const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const procs = [
  ['CLM', 'services/cem/index.js'],
  ['MDM', 'services/mad/index.js'],
  ['ACC', 'services/cam/index.js'],
  ['TAX', 'services/tim/index.js'],
  ['ALC', 'services/rpam/index.js'],
  ['DOC', 'services/forms-print/index.js'],
  ['Gateway', 'gateway/index.js'],
];

const children = [];

for (const [label, rel] of procs) {
  const child = spawn(process.execPath, [path.join(root, rel)], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  children.push(child);
  child.on('exit', (code) => {
    console.log(`[${label}] exited with code ${code}`);
  });
}

function shutdown() {
  for (const child of children) {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('TaxMesh V2 — starting 6 microservices + gateway');
console.log('  CLM :4201  MDM :4202  ACC :4203  TAX :4204  ALC :4205  DOC :4206');
console.log('UI: http://127.0.0.1:4200  (main stays on :4100)');
