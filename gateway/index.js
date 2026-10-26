const express = require('express');
const cors = require('cors');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const { SERVICES, CONTRACTS, GATEWAY_PORT, urlFor, JOURNEY, SERVICE_ORDER } = require('../shared/contracts');
const { PAYLOADS } = require('../shared/payloads');
const { buildOpenApi } = require('../shared/openapi');
const { createFilingRouter } = require('./filingRoutes');

const app = express();
const openapi = buildOpenApi();

app.use(cors());
app.use(express.json());
app.use('/api/filing', createFilingRouter());

app.get('/openapi.json', (_req, res) => {
  res.json(openapi);
});

app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(openapi, {
    customSiteTitle: 'TaxMesh API — Swagger',
    swaggerOptions: { docExpansion: 'list', filter: true, tryItOutEnabled: true },
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

app.use('/postman', express.static(path.join(__dirname, '../postman')));
app.use('/testdata', express.static(path.join(__dirname, '../testdata')));

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
    architecture: 'TaxMesh — 6 microservices · CEM MAD CAM TIM RPAM Forms · CT-00…CT-17',
    journey: JOURNEY,
    services,
  });
});

app.get('/api/architecture', (_req, res) => {
  res.json({
    title: 'Taxation Microservices Architecture',
    subtitle: 'CEM · MAD · CAM · TIM · RPAM · Forms Print — each a separate microservice. CT-00…CT-17 contracts.',
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

app.get('/api/contracts/:id', (_req, res) => {
  const ct = CONTRACTS.find((c) => c.id.toLowerCase() === String(_req.params.id).toLowerCase());
  if (!ct) return res.status(404).json({ error: 'Unknown contract' });
  res.json({ ...ct, samplePayload: PAYLOADS[ct.id] });
});

/** Guide letter aliases: A=MAD B=CAM C=TIM D=RPAM E=FORMS (CEM has no letter). */
const PROXY_ALIASES = { A: 'MAD', B: 'CAM', C: 'TIM', D: 'RPAM', E: 'FORMS' };

app.use('/api/proxy/:serviceId', async (req, res) => {
  const raw = String(req.params.serviceId).toUpperCase();
  const id = PROXY_ALIASES[raw] || raw;
  if (!SERVICES[id]) return res.status(404).json({ error: 'Unknown service', tried: raw });
  const suffix = req.url === '/' ? '/health' : req.url;
  const target = urlFor(id, suffix);

  // Multipart uploads (CEM/MAD/CAM /upload) — stream raw body
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
  console.log(`[Gateway] Services  CEM MAD CAM TIM RPAM FORMS`);
});
