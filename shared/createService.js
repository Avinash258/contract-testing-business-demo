const express = require('express');
const cors = require('cors');
const {
  SERVICES,
  contractsProducedBy,
  contractsConsumedBy,
  CONTRACTS,
  urlFor,
  resolveServiceId,
  apiDirection,
} = require('./contracts');
const { attachExcelUpload } = require('./serviceUploads');
const { attachBusinessValidationApis } = require('./serviceValidation');
const { attachFlowApis, attachPipeline, contractPayload } = require('./flowApis');
const { attachV2Apis } = require('./serviceV2Apis');

function createService(serviceId) {
  const id = resolveServiceId(serviceId);
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
      downstreamOut: produced.filter((c) => c.direction === 'downstream').map((c) => c.consumer),
      upstreamOut: produced.filter((c) => c.direction === 'reverse').map((c) => c.consumer),
    });
  });

  app.get('/contracts', (_req, res) => {
    res.json({
      service: meta,
      produced: produced.map((c) => ({ ...c, flow: apiDirection(c.direction) })),
      consumed: consumed.map((c) => ({ ...c, flow: apiDirection(c.direction) })),
    });
  });

  // Direction-scoped + peer flow APIs (must register before catch-all CT produce paths)
  attachFlowApis(app, id);

  for (const ct of produced) {
    app.get(ct.path, (_req, res) => {
      res.json({
        ...contractPayload(ct.id),
        producer: meta.id,
        consumer: ct.consumer,
        direction: ct.direction,
        flow: apiDirection(ct.direction),
        producedAt: new Date().toISOString(),
      });
    });
  }

  app.get('/consume/:contractId', async (req, res) => {
    const raw = String(req.params.contractId || '');
    // Reserve direction keywords for batch consume routes registered in flowApis
    if (/^(downstream|upstream|reverse)$/i.test(raw)) {
      return res.status(404).json({ error: `Use /consume/${raw.toLowerCase()} for batch pull` });
    }
    const ct = CONTRACTS.find((c) => c.id.toLowerCase() === raw.toLowerCase() && c.consumer === id);
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
        flow: apiDirection(ct.direction),
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

  attachPipeline(app, id, consumed);

  if (['CLM', 'MDM', 'ACC'].includes(id)) {
    attachExcelUpload(app, id);
  }

  if (['TAX', 'ALC'].includes(id)) {
    attachBusinessValidationApis(app, id);
  }

  // Branch v2: richer CLM + MDM (legacy MAD) APIs under /v2/*
  if (['CLM', 'MDM'].includes(id)) {
    attachV2Apis(app, id);
  }

  return { app, meta };
}

module.exports = { createService };
