const express = require('express');
const cors = require('cors');
const { SERVICES, contractsProducedBy, contractsConsumedBy, CONTRACTS, urlFor } = require('./contracts');
const { PAYLOADS } = require('./payloads');
const { attachExcelUpload } = require('./serviceUploads');
const { attachBusinessValidationApis } = require('./serviceValidation');

function createService(serviceId) {
  const id = String(serviceId).toUpperCase();
  const meta = SERVICES[id];
  if (!meta) throw new Error(`Unknown service id ${serviceId}`);

  const app = express();
  app.use(cors());
  app.use(express.json());

  const produced = contractsProducedBy(id);
  const consumed = contractsConsumedBy(id);

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: meta.key,
      id: meta.id,
      code: meta.code,
      name: meta.name,
      port: meta.port,
      produced: produced.map((c) => c.id),
      consumed: consumed.map((c) => c.id),
    });
  });

  app.get('/contracts', (_req, res) => {
    res.json({ service: meta, produced, consumed });
  });

  for (const ct of produced) {
    app.get(ct.path, (_req, res) => {
      res.json({
        ...PAYLOADS[ct.id],
        producer: meta.id,
        consumer: ct.consumer,
        direction: ct.direction,
        producedAt: new Date().toISOString(),
      });
    });
  }

  app.get('/consume/:contractId', async (req, res) => {
    const ct = CONTRACTS.find((c) => c.id === req.params.contractId && c.consumer === id);
    if (!ct) {
      return res.status(404).json({ error: `Service ${id} does not consume ${req.params.contractId}` });
    }
    try {
      const target = urlFor(ct.producer, ct.path);
      const response = await fetch(target);
      const body = await response.json();
      res.json({
        contractId: ct.id,
        consumer: id,
        producer: ct.producer,
        direction: ct.direction,
        sourceUrl: target,
        ok: response.ok,
        payload: body,
      });
    } catch (err) {
      res.status(502).json({
        error: 'Producer unreachable',
        contractId: ct.id,
        detail: String(err.message || err),
      });
    }
  });

  app.get('/pipeline', async (_req, res) => {
    const results = [];
    for (const ct of consumed) {
      try {
        const target = urlFor(ct.producer, ct.path);
        const response = await fetch(target);
        results.push({
          contractId: ct.id,
          direction: ct.direction,
          producer: ct.producer,
          status: response.ok ? 'ok' : 'error',
          httpStatus: response.status,
        });
      } catch {
        results.push({ contractId: ct.id, direction: ct.direction, producer: ct.producer, status: 'unreachable' });
      }
    }
    res.json({ service: meta.id, code: meta.code, consumedChecks: results });
  });

  // Excel import owned by CEM / MAD / CAM microservices
  if (['CEM', 'MAD', 'CAM'].includes(id)) {
    attachExcelUpload(app, id);
  }

  // Business validation + calculate/allocate for TIM and RPAM
  if (['TIM', 'RPAM'].includes(id)) {
    attachBusinessValidationApis(app, id);
  }

  return { app, meta };
}

module.exports = { createService };
