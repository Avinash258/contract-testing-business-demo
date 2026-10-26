const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '../shared/filingEngine.js');
let t = fs.readFileSync(p, 'utf8');
const map = [
  ["issue('CT-15', 'A'", "issue('CT-15', 'MAD'"],
  ["issue('CT-12', 'D'", "issue('CT-12', 'RPAM'"],
  ["issue('CT-08', 'C'", "issue('CT-08', 'TIM'"],
  ["issue('CT-05', 'B'", "issue('CT-05', 'CAM'"],
  ["issue('CT-09', 'C'", "issue('CT-09', 'TIM'"],
  ["issue('CT-13', 'D'", "issue('CT-13', 'RPAM'"],
  ["issue('CT-16', 'E'", "issue('CT-16', 'FORMS'"],
  ["issue('CT-17', 'E'", "issue('CT-17', 'FORMS'"],
];
for (const [a, b] of map) t = t.split(a).join(b);
fs.writeFileSync(p, t);
console.log('patched issue sources');
