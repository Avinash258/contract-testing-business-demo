/**
 * TAX / ALC microservice APIs for business validation and calculate/allocate.
 */
const filing = require('./filingEngine');
const { resolveServiceId } = require('./contracts');

function attachTaxApis(app) {
  app.get('/validate', (_req, res) => {
    const validation = filing.getTimValidation();
    res.status(validation.ok ? 200 : 422).json({
      service: 'TAX',
      ...validation,
      snapshot: filing.snapshot(),
    });
  });

  app.post('/validate', (_req, res) => {
    const validation = filing.getTimValidation();
    res.status(validation.ok ? 200 : 422).json({
      service: 'TAX',
      ...validation,
      snapshot: filing.snapshot(),
    });
  });

  app.post('/calculate', (req, res) => {
    try {
      const force = !!(req.body && req.body.force);
      filing.runTax({ skipValidationGate: force });
      const snap = filing.snapshot();
      const validation = snap.validations?.tax || snap.validations?.tim || filing.getTimValidation();
      res.status(validation.ok ? 200 : 422).json({
        ok: validation.ok,
        service: 'TAX',
        action: 'calculate',
        validation,
        taxComputation: snap.taxComputation,
        bookToTax: snap.bookToTax,
        snapshot: snap,
      });
    } catch (err) {
      res.status(422).json({
        ok: false,
        service: 'TAX',
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
      service: 'TAX',
      taxComputation: snap.taxComputation,
      bookToTax: snap.bookToTax,
      validation: snap.validations?.tax || snap.validations?.tim || null,
    });
  });
}

function attachAlcApis(app) {
  app.get('/validate', (_req, res) => {
    const validation = filing.getRpamValidation();
    res.status(validation.ok ? 200 : 422).json({
      service: 'ALC',
      ...validation,
      snapshot: filing.snapshot(),
    });
  });

  app.post('/validate', (_req, res) => {
    const validation = filing.getRpamValidation();
    res.status(validation.ok ? 200 : 422).json({
      service: 'ALC',
      ...validation,
      snapshot: filing.snapshot(),
    });
  });

  app.post('/allocate', (req, res) => {
    try {
      const force = !!(req.body && req.body.force);
      filing.runAllocate({ skipValidationGate: force });
      const snap = filing.snapshot();
      const validation = snap.validations?.alc || snap.validations?.rpam || filing.getRpamValidation();
      res.status(validation.ok ? 200 : 422).json({
        ok: validation.ok,
        service: 'ALC',
        action: 'allocate',
        validation,
        allocations: snap.allocations,
        snapshot: snap,
      });
    } catch (err) {
      res.status(422).json({
        ok: false,
        service: 'ALC',
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
      service: 'ALC',
      allocations: snap.allocations,
      validation: snap.validations?.alc || snap.validations?.rpam || null,
    });
  });
}

function attachBusinessValidationApis(app, serviceId) {
  const id = resolveServiceId(serviceId);
  if (id === 'TAX') attachTaxApis(app);
  if (id === 'ALC') attachAlcApis(app);
}

module.exports = {
  attachBusinessValidationApis,
  attachTaxApis,
  attachAlcApis,
  attachTimApis: attachTaxApis,
  attachRpamApis: attachAlcApis,
};
