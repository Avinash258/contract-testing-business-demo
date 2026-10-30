/**
 * Downstream / upstream data-flow APIs attached to every microservice.
 *
 * Downstream = journey-forward contracts (producer → later module)
 * Upstream   = reverse / feedback asks (later module → earlier module)
 */
const {
  SERVICES,
  CONTRACTS,
  urlFor,
  resolveServiceId,
  normalizeDirection,
  apiDirection,
  withApiDirection,
  contractsProducedByDirection,
  contractsConsumedByDirection,
  contractsBetween,
  flowSummary,
} = require('./contracts');
const { PAYLOADS } = require('./payloads');
const store = require('./filingStore');
const dataFlow = require('./dataFlow');

/** Live payload for contracts backed by uploaded state; sample payload otherwise. */
function contractPayload(contractId) {
  if (contractId === 'CT-00') {
    const s = store.read();
    if (dataFlow.hasClm(s)) {
      const live = dataFlow.clmPayload(s);
      for (const key of Object.keys(live)) if (live[key] === undefined) live[key] = null;
      return { contractId, ...live, source: 'live' };
    }
  }
  // CT-01 (MDM): single v2 update vs marco — legalName → entityName
  if (contractId === 'CT-01') {
    const base = PAYLOADS['CT-01'];
    const entities = (base.entities || []).map((e) => {
      const { legalName, entityName, ...rest } = e;
      return { ...rest, entityName: entityName || legalName };
    });
    return { ...base, entities, source: 'sample' };
  }
  return { ...PAYLOADS[contractId], source: 'sample' };
}

async function pullContract(ct, consumerId) {
  const target = urlFor(ct.producer, ct.path);
  try {
    const response = await fetch(target);
    const body = await response.json();
    return {
      contractId: ct.id,
      consumer: consumerId,
      producer: ct.producer,
      direction: ct.direction,
      flow: apiDirection(ct.direction),
      title: ct.title,
      sourceUrl: target,
      ok: response.ok,
      httpStatus: response.status,
      payload: body,
    };
  } catch (err) {
    return {
      contractId: ct.id,
      consumer: consumerId,
      producer: ct.producer,
      direction: ct.direction,
      flow: apiDirection(ct.direction),
      title: ct.title,
      sourceUrl: target,
      ok: false,
      error: String(err.message || err),
    };
  }
}

function produceEnvelope(ct, producerId) {
  return {
    ...contractPayload(ct.id),
    contractId: ct.id,
    title: ct.title,
    producer: producerId,
    consumer: ct.consumer,
    direction: ct.direction,
    flow: apiDirection(ct.direction),
    path: ct.path,
    producedAt: new Date().toISOString(),
  };
}

function attachFlowApis(app, serviceId) {
  const id = resolveServiceId(serviceId);
  const meta = SERVICES[id];

  app.get('/flow', (_req, res) => {
    res.json({
      service: meta,
      ...flowSummary(id),
      hint: {
        downstream: `GET /downstream/:peer  e.g. /downstream/TAX`,
        upstream: `GET /upstream/:peer  e.g. /upstream/MDM`,
        consume: `GET /consume/downstream | /consume/upstream`,
      },
    });
  });

  app.get('/contracts/downstream', (_req, res) => {
    res.json({
      service: id,
      flow: 'downstream',
      produced: contractsProducedByDirection(id, 'downstream'),
      consumed: contractsConsumedByDirection(id, 'downstream'),
    });
  });

  app.get('/contracts/upstream', (_req, res) => {
    res.json({
      service: id,
      flow: 'upstream',
      produced: contractsProducedByDirection(id, 'upstream'),
      consumed: contractsConsumedByDirection(id, 'upstream'),
    });
  });

  // Alias used in older CT guide wording
  app.get('/contracts/reverse', (_req, res) => {
    res.redirect(307, '/contracts/upstream');
  });

  app.get('/contracts/consumed/downstream', (_req, res) => {
    res.json({
      service: id,
      flow: 'downstream',
      consumed: contractsConsumedByDirection(id, 'downstream'),
    });
  });

  app.get('/contracts/consumed/upstream', (_req, res) => {
    res.json({
      service: id,
      flow: 'upstream',
      consumed: contractsConsumedByDirection(id, 'upstream'),
    });
  });

  /** List + produce payloads this service sends downstream to a peer. */
  app.get('/downstream/:peerId', (req, res) => {
    const peer = resolveServiceId(req.params.peerId);
    if (!SERVICES[peer]) return res.status(404).json({ error: `Unknown peer ${req.params.peerId}` });
    const contracts = contractsBetween(id, peer, 'downstream');
    if (!contracts.length) {
      return res.status(404).json({
        error: `No downstream contracts from ${id} → ${peer}`,
        service: id,
        peer,
        flow: 'downstream',
      });
    }
    res.json({
      service: id,
      peer,
      flow: 'downstream',
      contracts,
      payloads: contracts.map((ct) => produceEnvelope(ct, id)),
    });
  });

  /** List + produce payloads this service sends upstream (reverse ask) to a peer. */
  app.get('/upstream/:peerId', (req, res) => {
    const peer = resolveServiceId(req.params.peerId);
    if (!SERVICES[peer]) return res.status(404).json({ error: `Unknown peer ${req.params.peerId}` });
    const contracts = contractsBetween(id, peer, 'upstream');
    if (!contracts.length) {
      return res.status(404).json({
        error: `No upstream contracts from ${id} → ${peer}`,
        service: id,
        peer,
        flow: 'upstream',
      });
    }
    res.json({
      service: id,
      peer,
      flow: 'upstream',
      contracts,
      payloads: contracts.map((ct) => produceEnvelope(ct, id)),
    });
  });

  /** Batch-pull all downstream inputs this service consumes. */
  app.get('/consume/downstream', async (_req, res) => {
    const list = contractsConsumedByDirection(id, 'downstream');
    const results = [];
    for (const ct of list) results.push(await pullContract(ct, id));
    res.json({
      service: id,
      flow: 'downstream',
      count: results.length,
      ok: results.every((r) => r.ok),
      results,
    });
  });

  /** Batch-pull all upstream (reverse) inputs this service consumes. */
  app.get('/consume/upstream', async (_req, res) => {
    const list = contractsConsumedByDirection(id, 'upstream');
    const results = [];
    for (const ct of list) results.push(await pullContract(ct, id));
    res.json({
      service: id,
      flow: 'upstream',
      count: results.length,
      ok: results.every((r) => r.ok),
      results,
    });
  });
}

/**
 * Replace /pipeline with direction-aware version. Call from createService in place of old pipeline.
 */
function attachPipeline(app, serviceId, consumed) {
  const id = resolveServiceId(serviceId);
  const meta = SERVICES[id];

  app.get('/pipeline', async (req, res) => {
    const dir = req.query.direction ? normalizeDirection(req.query.direction) : null;
    const list = dir ? consumed.filter((c) => c.direction === dir) : consumed;
    const results = [];
    for (const ct of list) {
      try {
        const target = urlFor(ct.producer, ct.path);
        const response = await fetch(target);
        results.push({
          contractId: ct.id,
          direction: ct.direction,
          flow: apiDirection(ct.direction),
          producer: ct.producer,
          status: response.ok ? 'ok' : 'error',
          httpStatus: response.status,
        });
      } catch {
        results.push({
          contractId: ct.id,
          direction: ct.direction,
          flow: apiDirection(ct.direction),
          producer: ct.producer,
          status: 'unreachable',
        });
      }
    }
    res.json({
      service: meta.id,
      code: meta.code,
      directionFilter: dir ? apiDirection(dir) : 'all',
      consumedChecks: results,
    });
  });
}

module.exports = {
  attachFlowApis,
  attachPipeline,
  contractPayload,
  produceEnvelope,
  pullContract,
};
