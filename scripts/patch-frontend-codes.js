const fs = require('fs');
const path = require('path');

function patch(file, reps) {
  let s = fs.readFileSync(file, 'utf8');
  for (const [a, b] of reps) {
    if (!s.includes(a)) console.log('MISS', file, a.slice(0, 60));
    else s = s.split(a).join(b);
  }
  fs.writeFileSync(file, s);
  console.log('patched', path.basename(file));
}

patch(path.join(__dirname, '../frontend/app.js'), [
  ["if (id === 'CEM')", "if (id === 'CLM')"],
  ["} else if (id === 'MAD')", "} else if (id === 'MDM')"],
  ["} else if (id === 'CAM')", "} else if (id === 'ACC')"],
  ["} else if (id === 'TIM')", "} else if (id === 'TAX')"],
  ["} else if (id === 'RPAM')", "} else if (id === 'ALC')"],
  ["} else if (id === 'FORMS')", "} else if (id === 'DOC')"],
  ['f.validations?.tim', 'f.validations?.tax'],
  ['f.validations?.rpam', 'f.validations?.alc'],
  ['Run TIM validation', 'Run TAX validation'],
  ["renderValidationPanel(v, 'TIM')", "renderValidationPanel(v, 'TAX')"],
  ['Waiting for CEM + MAD + CAM. Upload CAM (or click Calculate) after validation passes.', 'Waiting for CLM + MDM + ACC. Upload ACC (or click Calculate) after validation passes.'],
  ["runModuleAction('tim-validate')", "runModuleAction('tax-validate')"],
  ["runModuleAction('tim-calculate')", "runModuleAction('tax-calculate')"],
  ['Run RPAM validation', 'Run ALC validation'],
  ["renderValidationPanel(v, 'RPAM')", "renderValidationPanel(v, 'ALC')"],
  ['Waiting for TIM calculation (and passing RPAM ownership rules).', 'Waiting for TAX calculation (and passing ALC ownership rules).'],
  ['Reconciles to TIM:', 'Reconciles to TAX:'],
  ["runModuleAction('rpam-validate')", "runModuleAction('alc-validate')"],
  ["runModuleAction('rpam-allocate')", "runModuleAction('alc-allocate')"],
  ["const consumedKey = id === 'FORMS' ? 'FORMS' : id;", 'const consumedKey = id;'],
  ["id === 'TIM' ? f.validations?.tax : id === 'RPAM' ? f.validations?.alc : null", "id === 'TAX' ? f.validations?.tax : id === 'ALC' ? f.validations?.alc : null"],
  ["upload CAM to calculate.", 'upload ACC to calculate.'],
  ["if (action === 'tim-validate') path = '/api/filing/validate/tim';", "if (action === 'tax-validate') path = '/api/filing/validate/tax';"],
  ["else if (action === 'rpam-validate') path = '/api/filing/validate/rpam';", "else if (action === 'alc-validate') path = '/api/filing/validate/alc';"],
  ["else if (action === 'tim-calculate') {\n    path = '/api/filing/tim/calculate';", "else if (action === 'tax-calculate') {\n    path = '/api/filing/tax/calculate';"],
  ["} else if (action === 'rpam-allocate') {\n    path = '/api/filing/rpam/allocate';", "} else if (action === 'alc-allocate') {\n    path = '/api/filing/alc/allocate';"],
  ['Upload CEM → MAD → CAM to generate Form 1065 lines.', 'Upload CLM → MDM → ACC to generate Form 1065 lines.'],
  ["const inputId = module === 'cem' ? 'fileCem' : module === 'mad' ? 'fileMad' : 'fileCam';", "const inputId = module === 'clm' || module === 'cem' ? 'fileCem' : module === 'mdm' || module === 'mad' ? 'fileMad' : 'fileCam';"],
  ["await uploadModule('cem');\n  await uploadModule('mad');\n  await uploadModule('cam');", "await uploadModule('clm');\n  await uploadModule('mdm');\n  await uploadModule('acc');"],
  ["Upload CEM → MAD → CAM.", 'Upload CLM → MDM → ACC.'],
  ['Upload CAM Excel after CEM + MAD', 'Upload ACC Excel after CLM + MDM'],
]);

patch(path.join(__dirname, '../gateway/filingRoutes.js'), [
  ["{ service: 'TIM', ...validation, snapshot: filing.snapshot() }", "{ service: 'TAX', ...validation, snapshot: filing.snapshot() }"],
  ["{ service: 'RPAM', ...validation, snapshot: filing.snapshot() }", "{ service: 'ALC', ...validation, snapshot: filing.snapshot() }"],
  ['router.get(\'/validate/tim\'', "router.get('/validate/tax'"],
  ['router.get(\'/validate/rpam\'', "router.get('/validate/alc'"],
  ["router.post('/tim/calculate'", "router.post('/tax/calculate'"],
  ["router.post('/rpam/allocate'", "router.post('/alc/allocate'"],
  ['snap.validations?.tim', 'snap.validations?.tax'],
  ['snap.validations?.rpam', 'snap.validations?.alc'],
  ['Proxy Excel upload to the owning microservice (CEM / MAD / CAM).', 'Proxy Excel upload to the owning microservice (CLM / MDM / ACC).'],
  ["router.post('/upload/cem', upload.single('file'), (req, res) => proxyUpload('CEM', req, res));\n  router.post('/upload/mad', upload.single('file'), (req, res) => proxyUpload('MAD', req, res));\n  router.post('/upload/cam', upload.single('file'), (req, res) => proxyUpload('CAM', req, res));",
   "router.post('/upload/clm', upload.single('file'), (req, res) => proxyUpload('CLM', req, res));\n  router.post('/upload/mdm', upload.single('file'), (req, res) => proxyUpload('MDM', req, res));\n  router.post('/upload/acc', upload.single('file'), (req, res) => proxyUpload('ACC', req, res));\n  // Legacy aliases\n  router.post('/upload/cem', upload.single('file'), (req, res) => proxyUpload('CLM', req, res));\n  router.post('/upload/mad', upload.single('file'), (req, res) => proxyUpload('MDM', req, res));\n  router.post('/upload/cam', upload.single('file'), (req, res) => proxyUpload('ACC', req, res));"],
]);

patch(path.join(__dirname, '../gateway/index.js'), [
  ["architecture: 'TaxMesh — 6 microservices · CEM MAD CAM TIM RPAM Forms · CT-00…CT-17'", "architecture: 'TaxMesh — 6 microservices · CLM MDM ACC TAX ALC DOC · CT-00…CT-17'"],
  ["subtitle: 'CEM · MAD · CAM · TIM · RPAM · Forms & Documents — each a separate microservice. CT-00…CT-17 contracts.'", "subtitle: 'CLM · MDM · ACC · TAX · ALC · DOC — each a separate microservice. CT-00…CT-17 contracts.'"],
  ['/** Guide letter aliases: A=MAD B=CAM C=TIM D=RPAM E=FORMS (CEM has no letter). */\nconst PROXY_ALIASES = { A: \'MAD\', B: \'CAM\', C: \'TIM\', D: \'RPAM\', E: \'FORMS\' };',
   "/** Letter + legacy aliases → current codes */\nconst { SERVICE_ALIASES: PROXY_ALIASES } = require('../shared/contracts');"],
  ['// Multipart uploads (CEM/MAD/CAM /upload)', '// Multipart uploads (CLM/MDM/ACC /upload)'],
  ['console.log(`[Gateway] Services  CEM MAD CAM TIM RPAM FORMS`);', 'console.log(`[Gateway] Services  CLM MDM ACC TAX ALC DOC`);'],
]);

patch(path.join(__dirname, '../scripts/start-all.js'), [
  ["['CEM', 'services/cem/index.js']", "['CLM', 'services/cem/index.js']"],
  ["['MAD', 'services/mad/index.js']", "['MDM', 'services/mad/index.js']"],
  ["['CAM', 'services/cam/index.js']", "['ACC', 'services/cam/index.js']"],
  ["['TIM', 'services/tim/index.js']", "['TAX', 'services/tim/index.js']"],
  ["['RPAM', 'services/rpam/index.js']", "['ALC', 'services/rpam/index.js']"],
  ["['FORMS', 'services/forms-print/index.js']", "['DOC', 'services/forms-print/index.js']"],
  ["console.log('  CEM  :4101  MAD :4102  CAM :4103  TIM :4104  RPAM :4105  Forms :4106');",
   "console.log('  CLM :4101  MDM :4102  ACC :4103  TAX :4104  ALC :4105  DOC :4106');"],
]);
