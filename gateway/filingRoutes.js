const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const filing = require('../shared/filingEngine');
const store = require('../shared/filingStore');
const { urlFor } = require('../shared/contracts');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = /\.xlsx$/i.test(file.originalname) || /spreadsheetml/i.test(file.mimetype);
    cb(ok ? null : new Error('Only .xlsx Excel files are supported'), ok);
  },
});

function createFilingRouter() {
  const router = express.Router();

  router.get('/', (_req, res) => {
    res.json(filing.snapshot());
  });

  router.post('/reset', (_req, res) => {
    filing.resetQuiet();
    res.json(filing.snapshot());
  });

  router.post('/run/:stepId', (req, res) => {
    try {
      filing.runStep(req.params.stepId);
      res.json(filing.snapshot());
    } catch (err) {
      res.status(400).json({ error: String(err.message || err), snapshot: filing.snapshot() });
    }
  });

  router.post('/run-all', (_req, res) => {
    try {
      filing.runAll();
      res.json(filing.snapshot());
    } catch (err) {
      res.status(400).json({ error: String(err.message || err), snapshot: filing.snapshot() });
    }
  });

  router.post('/process-flow', (_req, res) => {
    try {
      filing.processFlow();
      res.json(filing.snapshot());
    } catch (err) {
      res.status(400).json({ error: String(err.message || err), snapshot: filing.snapshot() });
    }
  });

  router.get('/validate/tax', (_req, res) => {
    const validation = filing.getTimValidation();
    res.status(validation.ok ? 200 : 422).json({ service: 'TAX', ...validation, snapshot: filing.snapshot() });
  });

  router.get('/validate/alc', (_req, res) => {
    const validation = filing.getRpamValidation();
    res.status(validation.ok ? 200 : 422).json({ service: 'ALC', ...validation, snapshot: filing.snapshot() });
  });

  router.post('/tax/calculate', (req, res) => {
    try {
      filing.runTax({ skipValidationGate: !!(req.body && req.body.force) });
      const snap = filing.snapshot();
      res.status(snap.validations?.tax?.ok ? 200 : 422).json({
        ok: !!snap.validations?.tax?.ok,
        validation: snap.validations?.tax,
        taxComputation: snap.taxComputation,
        snapshot: snap,
      });
    } catch (err) {
      res.status(422).json({
        ok: false,
        error: String(err.message || err),
        validation: err.validation || filing.getTimValidation(),
        snapshot: filing.snapshot(),
      });
    }
  });

  router.post('/alc/allocate', (req, res) => {
    try {
      filing.runAllocate({ skipValidationGate: !!(req.body && req.body.force) });
      const snap = filing.snapshot();
      res.status(snap.validations?.alc?.ok ? 200 : 422).json({
        ok: !!snap.validations?.alc?.ok,
        validation: snap.validations?.alc,
        allocations: snap.allocations,
        snapshot: snap,
      });
    } catch (err) {
      res.status(422).json({
        ok: false,
        error: String(err.message || err),
        validation: err.validation || filing.getRpamValidation(),
        snapshot: filing.snapshot(),
      });
    }
  });

  router.get('/data-flow', (_req, res) => {
    res.json(filing.snapshot().dataFlow);
  });

  router.post('/issues/:issueId/resolve', (req, res) => {
    filing.resolveIssue(req.params.issueId);
    res.json(filing.snapshot());
  });

  router.patch('/entity', (req, res) => {
    filing.updateEntity(req.body || {});
    res.json(filing.snapshot());
  });

  router.get('/jobs', (_req, res) => {
    const s = store.read();
    res.json({ jobs: s.jobs || [], correlationId: s.correlationId });
  });

  router.get('/gates', (_req, res) => {
    const s = store.read();
    res.json({ qualityGates: s.qualityGates || {} });
  });

  router.get('/form1065', (_req, res) => {
    const s = store.read();
    res.json({
      form1065: s.form1065,
      k1s: s.k1s,
      printPackage: s.printPackage,
      efile: s.efile,
      bookToTax: s.bookToTax,
      taxComputation: s.taxComputation,
      allocations: s.allocations,
    });
  });

  router.get('/datasets', (_req, res) => {
    const indexPath = path.join(__dirname, '../testdata/index.json');
    if (!fs.existsSync(indexPath)) {
      return res.status(404).json({ error: 'No datasets. Run npm run generate:excel' });
    }
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    res.json({
      ...index,
      downloadAll: '/download/testdata.zip',
      datasets: (index.datasets || []).map((d) => ({
        ...d,
        downloadZip: `/download/testdata/${d.id}.zip`,
        downloadUrls: {
          cem: d.files?.cem,
          mad: d.files?.mad,
          cam: d.files?.cam,
          zip: `/download/testdata/${d.id}.zip`,
        },
      })),
    });
  });

  /** Proxy Excel upload to the owning microservice (CLM / MDM / ACC). */
  async function proxyUpload(serviceId, req, res) {
    try {
      if (!req.file) return res.status(400).json({ error: 'Missing file field "file" (.xlsx)' });
      const form = new FormData();
      form.append('file', new Blob([req.file.buffer]), req.file.originalname);
      const target = urlFor(serviceId, '/upload');
      const r = await fetch(target, { method: 'POST', body: form });
      const body = await r.json();
      if (!r.ok) return res.status(r.status).json(body);
      // Always return enriched snapshot (includes dataFlow)
      res.json({
        ok: true,
        module: serviceId,
        routedTo: target,
        fileName: req.file.originalname,
        snapshot: filing.snapshot(),
      });
    } catch (err) {
      res.status(502).json({ error: String(err.message || err), snapshot: filing.snapshot() });
    }
  }

  router.post('/upload/clm', upload.single('file'), (req, res) => proxyUpload('CLM', req, res));
  router.post('/upload/mdm', upload.single('file'), (req, res) => proxyUpload('MDM', req, res));
  router.post('/upload/acc', upload.single('file'), (req, res) => proxyUpload('ACC', req, res));
  // Legacy aliases (CEM/MAD/CAM)
  router.post('/upload/cem', upload.single('file'), (req, res) => proxyUpload('CLM', req, res));
  router.post('/upload/mad', upload.single('file'), (req, res) => proxyUpload('MDM', req, res));
  router.post('/upload/cam', upload.single('file'), (req, res) => proxyUpload('ACC', req, res));

  router.use((err, _req, res, next) => {
    if (err instanceof multer.MulterError || /xlsx|Excel|file/i.test(String(err.message || ''))) {
      return res.status(400).json({ error: String(err.message || err) });
    }
    return next(err);
  });

  return router;
}

module.exports = { createFilingRouter };
