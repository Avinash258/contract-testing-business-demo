/**
 * Branch `v2` extras vs marco/main:
 * - One new CLM API: GET /v2/status
 * - MDM has no new /v2 routes (CT-01 field update lives in payloads / contractPayload)
 */
const store = require('./filingStore');
const dataFlow = require('./dataFlow');

function attachClmV2(app) {
  /** New on v2 (not on marco): compact CLM readiness. */
  app.get('/v2/status', (_req, res) => {
    const s = store.read();
    res.json({
      apiVersion: 2,
      service: 'CLM',
      ready: dataFlow.hasClm(s),
      engagementId: s.engagementId || null,
      entityName: s.entityName || s.entity?.legalName || null,
      taxYear: s.taxYear || null,
      correlationId: s.correlationId || null,
      feeds: ['MDM', 'ACC', 'TAX'],
    });
  });
}

function attachV2Apis(app, serviceId) {
  if (serviceId === 'CLM') attachClmV2(app);
}

module.exports = { attachV2Apis, attachClmV2 };
