/**
 * TIM / RPAM microservice APIs for business validation and calculate/allocate.
 */
const filing = require('./filingEngine');

function attachTimApis(app) {
  app.get('/validate', (_req, res) => {
    const validation = filing.getTimValidation();
    res.status(validation.ok ? 200 : 422).json({
      service: 'TIM',
      ...validation,
      snapshot: filing.snapshot(),
    });
  });

  app.post('/validate', (_req, res) => {
    const validation = filing.getTimValidation();
    res.status(validation.ok ? 200 : 422).json({
      service: 'TIM',
      ...validation,
      snapshot: filing.snapshot(),
    });
  });

  app.post('/calculate', (req, res) => {
    try {
      const force = !!(req.body && req.body.force);
      filing.runTax({ skipValidationGate: force });
      const snap = filing.snapshot();
      const validation = snap.validations?.tim || filing.getTimValidation();
      res.status(validation.ok ? 200 : 422).json({
        ok: validation.ok,
        service: 'TIM',
        action: 'calculate',
        validation,
        taxComputation: snap.taxComputation,
        bookToTax: snap.bookToTax,
        snapshot: snap,
      });
    } catch (err) {
      res.status(422).json({
        ok: false,
        service: 'TIM',
        action: 'calculate',
        error: String(err.message || err),
        validation: err.validation || filing.getTimValidation(),
        snapshot: filing.snapshot(),
      });
    }
  });

  app.get('/tax-computation', (_req, res) => {
    const snap = filing.snapshot();
    res.json({
      service: 'TIM',
      taxComputation: snap.taxComputation,
      bookToTax: snap.bookToTax,
      validation: snap.validations?.tim || null,
    });
  });
}

function attachRpamApis(app) {
  app.get('/validate', (_req, res) => {
    const validation = filing.getRpamValidation();
    res.status(validation.ok ? 200 : 422).json({
      service: 'RPAM',
      ...validation,
      snapshot: filing.snapshot(),
    });
  });

  app.post('/validate', (_req, res) => {
    const validation = filing.getRpamValidation();
    res.status(validation.ok ? 200 : 422).json({
      service: 'RPAM',
      ...validation,
      snapshot: filing.snapshot(),
    });
  });

  app.post('/allocate', (req, res) => {
    try {
      const force = !!(req.body && req.body.force);
      filing.runAllocate({ skipValidationGate: force });
      const snap = filing.snapshot();
      const validation = snap.validations?.rpam || filing.getRpamValidation();
      res.status(validation.ok ? 200 : 422).json({
        ok: validation.ok,
        service: 'RPAM',
        action: 'allocate',
        validation,
        allocations: snap.allocations,
        snapshot: snap,
      });
    } catch (err) {
      res.status(422).json({
        ok: false,
        service: 'RPAM',
        action: 'allocate',
        error: String(err.message || err),
        validation: err.validation || filing.getRpamValidation(),
        snapshot: filing.snapshot(),
      });
    }
  });

  app.get('/allocations', (_req, res) => {
    const snap = filing.snapshot();
    res.json({
      service: 'RPAM',
      allocations: snap.allocations,
      validation: snap.validations?.rpam || null,
    });
  });
}

function attachBusinessValidationApis(app, serviceId) {
  const id = String(serviceId).toUpperCase();
  if (id === 'TIM') attachTimApis(app);
  if (id === 'RPAM') attachRpamApis(app);
}

module.exports = { attachBusinessValidationApis, attachTimApis, attachRpamApis };
