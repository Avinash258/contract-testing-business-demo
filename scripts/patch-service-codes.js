const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../shared/filingEngine.js');
let s = fs.readFileSync(file, 'utf8');

const reps = [
  ["issue('CT-09', 'TIM'", "issue('CT-09', 'TAX'"],
  ["issue('CT-08', 'TIM'", "issue('CT-08', 'TAX'"],
  ["issue('CT-13', 'RPAM'", "issue('CT-13', 'ALC'"],
  ["issue('CT-16', 'FORMS'", "issue('CT-16', 'DOC'"],
  ["issue('CT-17', 'FORMS'", "issue('CT-17', 'DOC'"],
  ["issue('CT-15', 'MAD'", "issue('CT-15', 'MDM'"],
  ["issue('CT-12', 'RPAM'", "issue('CT-12', 'ALC'"],
  ["issue('CT-05', 'CAM'", "issue('CT-05', 'ACC'"],
  ["'create-engagement', 'CEM'", "'create-engagement', 'CLM'"],
  ["'mad-import', 'MAD'", "'mad-import', 'MDM'"],
  ["'cam-import-sync', 'CAM'", "'cam-import-sync', 'ACC'"],
  ["'tim-recalculation', 'TIM'", "'tim-recalculation', 'TAX'"],
  ["'rpam-allocate-tier', 'RPAM'", "'rpam-allocate-tier', 'ALC'"],
  ["'forms-print-package', 'ERE / Forms Print'", "'forms-print-package', 'DOC'"],
  ["'mef-submit', 'Forms Print'", "'mef-submit', 'DOC'"],
  ["'cem-excel-import', 'CEM'", "'cem-excel-import', 'CLM'"],
  ["'mad-excel-import', 'MAD'", "'mad-excel-import', 'MDM'"],
  ["'cam-excel-import', 'CAM'", "'cam-excel-import', 'ACC'"],
  ['s.validations.tim', 's.validations.tax'],
  ['s.validations.rpam', 's.validations.alc'],
  ["consumedBy: ['MAD', 'CAM', 'TIM']", "consumedBy: ['MDM', 'ACC', 'TAX']"],
  ["consumedBy: ['CAM', 'TIM']", "consumedBy: ['ACC', 'TAX']"],
  ["consumedFrom: ['CEM']", "consumedFrom: ['CLM']"],
  ["consumedFrom: ['CEM', 'MAD']", "consumedFrom: ['CLM', 'MDM']"],
  ["consumedBy: ['TIM', 'RPAM']", "consumedBy: ['TAX', 'ALC']"],
  ["flowsTo: ['MAD', 'CAM', 'TIM']", "flowsTo: ['MDM', 'ACC', 'TAX']"],
  ["flowsTo: ['CAM', 'TIM']", "flowsTo: ['ACC', 'TAX']"],
  ["flowsTo: ['TIM', 'RPAM']", "flowsTo: ['TAX', 'ALC']"],
];

for (const [a, b] of reps) {
  if (!s.includes(a)) console.log('MISS', a);
  else s = s.split(a).join(b);
}

if (!s.includes('s.imports.clm = s.imports.cem')) {
  s = s.replace(/s\.imports\.cem = \{/g, 's.imports.clm = s.imports.cem = {');
}
if (!s.includes('s.imports.mdm = s.imports.mad')) {
  s = s.replace(/s\.imports\.mad = \{/g, 's.imports.mdm = s.imports.mad = {');
}
if (!s.includes('s.imports.acc = s.imports.cam')) {
  s = s.replace(/s\.imports\.cam = \{/g, 's.imports.acc = s.imports.cam = {');
}
if (!s.includes('s.published.clm = s.published.cem')) {
  s = s.replace(/s\.published\.cem = \{/g, 's.published.clm = s.published.cem = {');
}
if (!s.includes('s.published.mdm = s.published.mad')) {
  s = s.replace(/s\.published\.mad = \{/g, 's.published.mdm = s.published.mad = {');
}
if (!s.includes('s.published.acc = s.published.cam')) {
  s = s.replace(/s\.published\.cam = \{/g, 's.published.acc = s.published.cam = {');
}

fs.writeFileSync(file, s);
console.log('Patched', file);
