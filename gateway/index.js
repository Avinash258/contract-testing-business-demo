const express = require('express');
const cors = require('cors');
const fs = require('fs');
const os = require('os');
const path = require('path');
const archiver = require('archiver');
const swaggerUi = require('swagger-ui-express');
const {
  SERVICES,
  CONTRACTS,
  GATEWAY_PORT,
  urlFor,
  JOURNEY,
  SERVICE_ORDER,
  resolveServiceId,
  normalizeDirection,
  apiDirection,
  withApiDirection,
  contractsBetween,
  allFlowEdges,
  flowSummary,
} = require('../shared/contracts');
const { PAYLOADS } = require('../shared/payloads');
const { buildOpenApi } = require('../shared/openapi');
const { createFilingRouter } = require('./filingRoutes');
const { produceEnvelope } = require('../shared/flowApis');

const TESTDATA_ROOT = path.join(__dirname, '../testdata');

function buildTestdataZip(folderName) {
  return new Promise((resolve, reject) => {
    const abs = folderName ? path.join(TESTDATA_ROOT, folderName) : TESTDATA_ROOT;
    if (!fs.existsSync(abs)) {
      reject(Object.assign(new Error(`Testdata not found: ${folderName || 'root'}`), { status: 404 }));
      return;
    }
    const tmp = path.join(os.tmpdir(), `taxmesh-${Date.now()}-${Math.random().toString(16).slice(2)}.zip`);
    const output = fs.createWriteStream(tmp);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve(tmp));
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    if (folderName) archive.directory(abs, folderName);
    else archive.directory(TESTDATA_ROOT, false);
    archive.finalize();
  });
}

async function sendTestdataZip(res, zipName, folderName) {
  let tmp;
  try {
    tmp = await buildTestdataZip(folderName);
    res.download(tmp, zipName, (err) => {
      if (tmp) {
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* ignore */
        }
      }
      if (err && !res.headersSent) {
        res.status(500).json({ error: String(err.message || err) });
      }
    });
  } catch (err) {
    if (tmp) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
    const status = err.status || 500;
    if (!res.headersSent) res.status(status).json({ error: String(err.message || err) });
  }
}

const app = express();

// Cloudflare / reverse-proxy: honor X-Forwarded-* so HTTPS + host are correct
app.set('trust proxy', true);

app.use(cors());
app.use(express.json());
app.use('/api/filing', createFilingRouter());

function requestPublicBase(req) {
  const fromEnv = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.get('x-forwarded-host') || req.get('host') || `127.0.0.1:${GATEWAY_PORT}`)
    .split(',')[0]
    .trim();
  return `${proto}://${host}`;
}

/** Dynamic OpenAPI — servers follow the tunnel / public host (not hardcoded localhost). */
app.get('/openapi.json', (req, res) => {
  const serverUrl = requestPublicBase(req);
  res.json(buildOpenApi({ serverUrl }));
});

app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(null, {
    customSiteTitle: 'TaxMesh API — Swagger',
    swaggerUrl: '/openapi.json',
    swaggerOptions: {
      url: '/openapi.json',
      docExpansion: 'list',
      filter: true,
      tryItOutEnabled: true,
      // Prefer same-origin relative server from the fetched spec
      persistAuthorization: false,
    },
  })
);

app.use('/docs', express.static(path.join(__dirname, '../docs'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.md')) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    }
    if (filePath.endsWith('.docx')) {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${path.basename(filePath)}"`
      );
    }
  },
}));

/** Explicit download route for the Architecture & Developer Guide Word file */
app.get('/download/architecture-guide', (_req, res) => {
  const file = path.join(__dirname, '../docs/TaxMesh_API_Architecture_and_Developer_Guide.docx');
  res.download(file, 'TaxMesh_API_Architecture_and_Developer_Guide.docx', (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'Guide Word file not found. Run npm run generate:guide' });
    }
  });
});

/** Download all Excel demo sets as a zip */
app.get('/download/testdata', (_req, res) => {
  sendTestdataZip(res, 'taxmesh-testdata.zip', null);
});
app.get('/download/testdata.zip', (_req, res) => {
  sendTestdataZip(res, 'taxmesh-testdata.zip', null);
});

/** Download one set (set-01 … set-05) as a zip — /download/testdata/set-01 or …/set-01.zip */
app.get('/download/testdata/:setId', (req, res) => {
  const setId = String(req.params.setId || '')
    .toLowerCase()
    .replace(/\.zip$/i, '');
  if (!/^set-0[1-5]$/.test(setId)) {
    return res.status(400).json({ error: 'Use set-01 … set-05' });
  }
  return sendTestdataZip(res, `taxmesh-${setId}.zip`, setId);
});

app.use('/postman', express.static(path.join(__dirname, '../postman')));
app.use(
  '/testdata',
  express.static(TESTDATA_ROOT, {
    setHeaders(res, filePath) {
      if (/\.xlsx$/i.test(filePath)) {
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
      }
    },
  })
);

app.get('/api/health', async (_req, res) => {
  const services = [];
  for (const id of SERVICE_ORDER) {
    const svc = SERVICES[id];
    try {
      const r = await fetch(urlFor(id, '/health'));
      const body = await r.json();
      services.push({ ...svc, healthy: r.ok, detail: body });
    } catch (err) {
      services.push({ ...svc, healthy: false, error: String(err.message || err) });
    }
  }
  res.json({
    gateway: 'ok',
    architecture: 'TaxMesh — 6 microservices · CLM MDM ACC TAX ALC DOC · CT-00…CT-17',
    journey: JOURNEY,
    services,
  });
});

app.get('/api/architecture', (_req, res) => {
  res.json({
    title: 'Taxation Microservices Architecture',
    subtitle: 'CLM · MDM · ACC · TAX · ALC · DOC — each a separate microservice. CT-00…CT-17 contracts.',
    journey: JOURNEY,
    services: SERVICE_ORDER.map((id) => SERVICES[id]),
    contracts: CONTRACTS,
    matrix: buildMatrix(),
    counts: {
      services: SERVICE_ORDER.length,
      downstream: CONTRACTS.filter((c) => c.direction === 'downstream').length,
      reverse: CONTRACTS.filter((c) => c.direction === 'reverse').length,
      total: CONTRACTS.length,
    },
  });
});

app.get('/api/contracts', (req, res) => {
  const dir = req.query.direction ? normalizeDirection(req.query.direction) : null;
  const producer = req.query.producer ? resolveServiceId(req.query.producer) : null;
  const consumer = req.query.consumer ? resolveServiceId(req.query.consumer) : null;
  let list = CONTRACTS.map(withApiDirection);
  if (dir) list = list.filter((c) => c.direction === dir);
  if (producer) list = list.filter((c) => c.producer === producer);
  if (consumer) list = list.filter((c) => c.consumer === consumer);
  res.json({
    count: list.length,
    filters: {
      direction: dir ? apiDirection(dir) : null,
      producer,
      consumer,
    },
    contracts: list,
  });
});

app.get('/api/contracts/:id', (_req, res) => {
  const ct = CONTRACTS.find((c) => c.id.toLowerCase() === String(_req.params.id).toLowerCase());
  if (!ct) return res.status(404).json({ error: 'Unknown contract' });
  res.json({ ...withApiDirection(ct), samplePayload: PAYLOADS[ct.id] });
});

/** Full data-flow catalog: downstream + upstream edges across all modules. */
app.get('/api/flow', (_req, res) => {
  const edges = allFlowEdges();
  res.json({
    journey: JOURNEY,
    services: SERVICE_ORDER.map((id) => ({
      ...SERVICES[id],
      ...flowSummary(id),
    })),
    edges,
    counts: {
      downstream: edges.filter((e) => e.flow === 'downstream').length,
      upstream: edges.filter((e) => e.flow === 'upstream').length,
      total: edges.length,
    },
    endpoints: {
      serviceFlow: '/api/proxy/{CLM|MDM|ACC|TAX|ALC|DOC}/flow',
      downstreamToPeer: '/api/proxy/{from}/downstream/{to}',
      upstreamToPeer: '/api/proxy/{from}/upstream/{to}',
      consumeDownstream: '/api/proxy/{consumer}/consume/downstream',
      consumeUpstream: '/api/proxy/{consumer}/consume/upstream',
      pairDownstream: '/api/flow/downstream/{from}/{to}',
      pairUpstream: '/api/flow/upstream/{from}/{to}',
    },
  });
});

app.get('/api/flow/edges', (req, res) => {
  const dir = req.query.direction ? normalizeDirection(req.query.direction) : null;
  let edges = allFlowEdges();
  if (dir) edges = edges.filter((e) => e.direction === dir);
  res.json({ count: edges.length, direction: dir ? apiDirection(dir) : 'all', edges });
});

async function flowPair(req, res, direction) {
  const from = resolveServiceId(req.params.from);
  const to = resolveServiceId(req.params.to);
  if (!SERVICES[from] || !SERVICES[to]) {
    return res.status(404).json({ error: 'Unknown service in path', from: req.params.from, to: req.params.to });
  }
  const contracts = contractsBetween(from, to, direction);
  if (!contracts.length) {
    return res.status(404).json({
      error: `No ${apiDirection(normalizeDirection(direction))} contracts from ${from} → ${to}`,
      from,
      to,
      flow: apiDirection(normalizeDirection(direction)),
    });
  }

  const live = [];
  for (const ct of contracts) {
    const sample = produceEnvelope(ct, from);
    let pulled = null;
    try {
      const target = urlFor(from, ct.path);
      const r = await fetch(target);
      const body = await r.json();
      pulled = { ok: r.ok, httpStatus: r.status, sourceUrl: target, payload: body };
    } catch (err) {
      pulled = { ok: false, error: String(err.message || err) };
    }
    live.push({ contractId: ct.id, title: ct.title, sample, live: pulled });
  }

  res.json({
    from,
    to,
    flow: apiDirection(normalizeDirection(direction)),
    contracts,
    payloads: live,
  });
}

app.get('/api/flow/downstream/:from/:to', (req, res) => flowPair(req, res, 'downstream'));
app.get('/api/flow/upstream/:from/:to', (req, res) => flowPair(req, res, 'upstream'));

app.use('/api/proxy/:serviceId', async (req, res) => {
  const raw = String(req.params.serviceId).toUpperCase();
  const id = resolveServiceId(raw);
  if (!SERVICES[id]) return res.status(404).json({ error: 'Unknown service', tried: raw });
  const suffix = req.url === '/' ? '/health' : req.url;
  const target = urlFor(id, suffix);

  // Multipart uploads (CLM/MDM/ACC /upload) — stream raw body
  if (req.method === 'POST' && suffix.startsWith('/upload')) {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const bodyBuf = Buffer.concat(chunks);
      const r = await fetch(target, {
        method: 'POST',
        headers: {
          'content-type': req.headers['content-type'] || 'application/octet-stream',
        },
        body: bodyBuf,
      });
      const text = await r.text();
      try {
        return res.status(r.status).json(JSON.parse(text));
      } catch {
        return res.status(r.status).send(text);
      }
    } catch (err) {
      return res.status(502).json({ error: 'Upstream unreachable', target, detail: String(err.message || err) });
    }
  }

  try {
    const r = await fetch(target, { method: req.method === 'GET' ? 'GET' : req.method });
    const body = await r.json();
    res.status(r.status).json(body);
  } catch (err) {
    res.status(502).json({ error: 'Upstream unreachable', target, detail: String(err.message || err) });
  }
});

function buildMatrix() {
  const ids = SERVICE_ORDER;
  const cells = {};
  for (const p of ids) {
    cells[p] = {};
    for (const c of ids) {
      cells[p][c] = CONTRACTS.filter((x) => x.producer === p && x.consumer === c).map((x) => ({
        id: x.id,
        direction: x.direction,
      }));
    }
  }
  return cells;
}

app.use(express.static(path.join(__dirname, '../frontend')));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(GATEWAY_PORT, () => {
  console.log(`[Gateway] UI        http://127.0.0.1:${GATEWAY_PORT}`);
  console.log(`[Gateway] Swagger   http://127.0.0.1:${GATEWAY_PORT}/api-docs`);
  console.log(`[Gateway] Services  CLM MDM ACC TAX ALC DOC`);
});
