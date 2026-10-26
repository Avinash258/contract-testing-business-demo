const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const procs = [
  ['CEM', 'services/cem/index.js'],
  ['MAD', 'services/mad/index.js'],
  ['CAM', 'services/cam/index.js'],
  ['TIM', 'services/tim/index.js'],
  ['RPAM', 'services/rpam/index.js'],
  ['FORMS', 'services/forms-print/index.js'],
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

console.log('TaxMesh — starting 6 microservices + gateway');
console.log('  CEM  :4101  MAD :4102  CAM :4103  TIM :4104  RPAM :4105  Forms :4106');
console.log('UI: http://127.0.0.1:4100');
