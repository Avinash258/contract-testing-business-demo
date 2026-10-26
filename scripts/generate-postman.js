/**
 * Builds Postman collection + environment for all TaxMesh APIs.
 * Output: postman/TaxMesh.postman_collection.json
 *         postman/TaxMesh.postman_environment.json
 */
const fs = require('fs');
const path = require('path');
const {
  SERVICES,
  CONTRACTS,
  SERVICE_ORDER,
  allFlowEdges,
  apiDirection,
} = require('../shared/contracts');
const { PAYLOADS } = require('../shared/payloads');

function req(name, method, urlPath, opts = {}) {
  const item = {
    name,
    request: {
      method,
      header: [{ key: 'Accept', value: 'application/json' }],
      url: `{{baseUrl}}${urlPath}`,
      description: opts.description || '',
    },
  };
  if (opts.body !== undefined) {
    item.request.header.push({ key: 'Content-Type', value: 'application/json' });
    item.request.body = {
      mode: 'raw',
      raw: typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body, null, 2),
    };
  }
  if (opts.formdata) {
    item.request.body = { mode: 'formdata', formdata: opts.formdata };
    item.request.header = item.request.header.filter((h) => h.key !== 'Content-Type');
  }
  return item;
}

const get = (name, urlPath, description) => req(name, 'GET', urlPath, { description });
const post = (name, urlPath, description, body) =>
  req(name, 'POST', urlPath, { description, body: body === undefined ? '{}' : body });

const gateway = {
  name: '00 Gateway',
  item: [
    get('Health — all services', '/api/health', 'Gateway + CLM…DOC health'),
    get('Architecture catalog', '/api/architecture', 'Services, contracts, matrix'),
    get('List contracts', '/api/contracts', 'All CT-00…CT-17'),
    get('List contracts — downstream', '/api/contracts?direction=downstream'),
    get('List contracts — upstream', '/api/contracts?direction=upstream'),
    get('Contract CT-01 detail', '/api/contracts/CT-01', 'Metadata + sample payload'),
    get('Contract CT-00 detail', '/api/contracts/CT-00'),
    get('OpenAPI JSON', '/openapi.json', 'Dynamic servers (same-origin / tunnel-safe)'),
  ],
};

const flow = {
  name: '01 Data flow — downstream & upstream',
  item: [
    get('Full flow catalog', '/api/flow', 'Peers, edges, endpoint map'),
    get('All edges', '/api/flow/edges'),
    get('Downstream edges only', '/api/flow/edges?direction=downstream'),
    get('Upstream edges only', '/api/flow/edges?direction=upstream'),
    get('Downstream MDM → TAX', '/api/flow/downstream/MDM/TAX', 'CT-02 live + sample'),
    get('Downstream ACC → TAX', '/api/flow/downstream/ACC/TAX', 'CT-06'),
    get('Downstream ACC → ALC', '/api/flow/downstream/ACC/ALC', 'CT-07'),
    get('Downstream TAX → ALC', '/api/flow/downstream/TAX/ALC', 'CT-10'),
    get('Downstream TAX → DOC', '/api/flow/downstream/TAX/DOC', 'CT-11'),
    get('Downstream ALC → DOC', '/api/flow/downstream/ALC/DOC', 'CT-14'),
    get('Downstream CLM → MDM', '/api/flow/downstream/CLM/MDM', 'CT-00'),
    get('Upstream TAX → MDM', '/api/flow/upstream/TAX/MDM', 'CT-08'),
    get('Upstream TAX → ACC', '/api/flow/upstream/TAX/ACC', 'CT-09'),
    get('Upstream ALC → MDM', '/api/flow/upstream/ALC/MDM', 'CT-12'),
    get('Upstream DOC → MDM', '/api/flow/upstream/DOC/MDM', 'CT-15'),
  ],
};

const filing = {
  name: '02 Filing — Form 1065 journey',
  item: [
    get('GET filing snapshot', '/api/filing', 'Engagement + dataFlow + validations'),
    post('Reset engagement (blank)', '/api/filing/reset', 'Clears banner, uploads, calcs'),
    get('Data-flow graph', '/api/filing/data-flow'),
    get('List Excel datasets', '/api/filing/datasets'),
    get('Form 1065 artifacts', '/api/filing/form1065'),
    get('Quality gates AQG1-5', '/api/filing/gates'),
    get('Async jobs', '/api/filing/jobs'),
    post('Process flow (TAX→ALC→DOC)', '/api/filing/process-flow'),
    post('Run step — cem', '/api/filing/run/cem'),
    post('Run step — setup', '/api/filing/run/setup'),
    post('Run step — books', '/api/filing/run/books'),
    post('Run step — tax', '/api/filing/run/tax'),
    post('Run step — allocate', '/api/filing/run/allocate'),
    post('Run step — forms', '/api/filing/run/forms'),
    post('Run step — efile', '/api/filing/run/efile'),
    post('Run full journey (seeded)', '/api/filing/run-all'),
    get('Validate TAX', '/api/filing/validate/tax'),
    get('Validate ALC', '/api/filing/validate/alc'),
    post('Calculate TAX', '/api/filing/tax/calculate', 'Force with body { "force": true }', {
      force: false,
    }),
    post('Allocate ALC', '/api/filing/alc/allocate', 'Force with body { "force": true }', {
      force: false,
    }),
    req('Upload CLM Excel', 'POST', '/api/filing/upload/clm', {
      description: 'Multipart field **file** = testdata/set-01/clm.xlsx',
      formdata: [
        {
          key: 'file',
          type: 'file',
          src: [],
          description: 'Select clm.xlsx from testdata/set-0N/',
        },
      ],
    }),
    req('Upload MDM Excel', 'POST', '/api/filing/upload/mdm', {
      description: 'Multipart field **file** = mdm.xlsx (needs CLM first)',
      formdata: [{ key: 'file', type: 'file', src: [], description: 'Select mdm.xlsx' }],
    }),
    req('Upload ACC Excel & process', 'POST', '/api/filing/upload/acc', {
      description: 'Multipart field **file** = acc.xlsx → auto TAX→ALC→DOC',
      formdata: [{ key: 'file', type: 'file', src: [], description: 'Select acc.xlsx' }],
    }),
  ],
};

const downloads = {
  name: '03 Downloads',
  item: [
    get('Architecture guide (.docx)', '/download/architecture-guide'),
    get('All testdata ZIP', '/download/testdata.zip'),
    get('Testdata set-01 ZIP', '/download/testdata/set-01.zip'),
    get('Postman collection JSON', '/download/postman-collection'),
    get('Postman environment JSON', '/download/postman-environment'),
    get('OpenAPI JSON file', '/openapi.json'),
  ],
};

const byService = {};
for (const id of SERVICE_ORDER) {
  const s = SERVICES[id];
  const items = [
    get(`${id} health`, `/api/proxy/${id}/health`),
    get(`${id} contracts catalog`, `/api/proxy/${id}/contracts`),
    get(`${id} flow summary`, `/api/proxy/${id}/flow`, 'Downstream + upstream peers'),
    get(`${id} contracts/downstream`, `/api/proxy/${id}/contracts/downstream`),
    get(`${id} contracts/upstream`, `/api/proxy/${id}/contracts/upstream`),
    get(`${id} consume/downstream`, `/api/proxy/${id}/consume/downstream`),
    get(`${id} consume/upstream`, `/api/proxy/${id}/consume/upstream`),
    get(`${id} pipeline`, `/api/proxy/${id}/pipeline`),
    get(`${id} pipeline ?direction=downstream`, `/api/proxy/${id}/pipeline?direction=downstream`),
    get(`${id} pipeline ?direction=upstream`, `/api/proxy/${id}/pipeline?direction=upstream`),
  ];

  if (['CLM', 'MDM', 'ACC'].includes(id)) {
    items.push(
      req(`${id} POST /upload`, 'POST', `/api/proxy/${id}/upload`, {
        description: `Direct service upload for ${id}`,
        formdata: [{ key: 'file', type: 'file', src: [] }],
      })
    );
  }
  if (id === 'CLM') {
    items.push(
      get('CLM v2 engagement', '/api/proxy/CLM/v2/engagement'),
      get('CLM v2 status', '/api/proxy/CLM/v2/status'),
      req('CLM v2 patch engagement', 'PATCH', '/api/proxy/CLM/v2/engagement', {
        description: 'Update entityName / taxYear / etc.',
        body: { entityName: 'Alpha Partners LP', taxYear: 2025 },
      })
    );
  }
  if (id === 'MDM') {
    items.push(
      get('MDM v2 entity', '/api/proxy/MDM/v2/entity'),
      get('MDM v2 partners', '/api/proxy/MDM/v2/partners'),
      get('MDM v2 ownership', '/api/proxy/MDM/v2/ownership'),
      get('MDM v2 status', '/api/proxy/MDM/v2/status')
    );
  }
  if (id === 'TAX') {
    items.push(
      get('TAX validate', `/api/proxy/TAX/validate`),
      post('TAX calculate', `/api/proxy/TAX/calculate`, '', {})
    );
  }
  if (id === 'ALC') {
    items.push(
      get('ALC validate', `/api/proxy/ALC/validate`),
      post('ALC allocate', `/api/proxy/ALC/allocate`, '', {})
    );
  }

  byService[id] = {
    name: `Service ${id} — ${s.name}`,
    item: items,
  };
}

// Peer flow produce routes
const peerPairs = allFlowEdges();
const seenPeer = new Set();
for (const e of peerPairs) {
  const key = `${e.from}:${e.to}:${e.flow}`;
  if (seenPeer.has(key)) continue;
  seenPeer.add(key);
  const folder = e.flow === 'downstream' ? 'downstream' : 'upstream';
  byService[e.from].item.push(
    get(
      `${e.from} ${folder} → ${e.to}`,
      `/api/proxy/${e.from}/${folder}/${e.to}`,
      `${e.id}: ${e.title}`
    )
  );
}

const contractsFolder = {
  name: '04 Contracts CT-00…CT-17',
  item: [],
};

for (const ct of CONTRACTS) {
  const flow = apiDirection(ct.direction);
  contractsFolder.item.push({
    name: `${ct.id} ${ct.producer}→${ct.consumer} (${flow})`,
    item: [
      get(
        `Produce — ${ct.path}`,
        `/api/proxy/${ct.producer}${ct.path}`,
        `${ct.title}\n\nSample:\n\`\`\`json\n${JSON.stringify(PAYLOADS[ct.id], null, 2)}\n\`\`\``
      ),
      get(
        `Consume as ${ct.consumer}`,
        `/api/proxy/${ct.consumer}/consume/${ct.id}`,
        'Consumer pull of producer payload'
      ),
    ],
  });
}

const aliases = {
  name: '05 Letter & legacy aliases',
  item: [
    get('Letter A = MDM health', '/api/proxy/A/health'),
    get('Letter B = ACC health', '/api/proxy/B/health'),
    get('Letter C = TAX health', '/api/proxy/C/health'),
    get('Letter D = ALC health', '/api/proxy/D/health'),
    get('Letter E = DOC health', '/api/proxy/E/health'),
    get('Legacy CEM → CLM health', '/api/proxy/CEM/health'),
    get('Legacy MAD → MDM health', '/api/proxy/MAD/health'),
    get('Legacy TIM → TAX health', '/api/proxy/TIM/health'),
  ],
};

const collection = {
  info: {
    name: 'TaxMesh — CLM MDM ACC TAX ALC DOC',
    description: [
      'TaxMesh partnership Form 1065 demo APIs.',
      '',
      '**Workspaces:** CLM · MDM · ACC · TAX · ALC · DOC',
      '**Contracts:** CT-00 … CT-17 (10 downstream + 8 upstream)',
      '**Flow:** GET /api/flow · /api/proxy/{svc}/downstream|{upstream}/{peer}',
      '',
      'Import with **TaxMesh Local** environment. Set `baseUrl` to your gateway',
      '(local http://127.0.0.1:4100 or Cloudflare tunnel HTTPS URL).',
      '',
      'Excel uploads: select file from testdata/set-0N/{clm,mdm,acc}.xlsx',
    ].join('\n'),
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [{ key: 'baseUrl', value: 'http://127.0.0.1:4100' }],
  item: [gateway, flow, filing, downloads, contractsFolder, aliases, ...SERVICE_ORDER.map((id) => byService[id])],
};

const env = {
  id: 'taxmesh-local',
  name: 'TaxMesh Local',
  values: [
    { key: 'baseUrl', value: 'http://127.0.0.1:4100', type: 'default', enabled: true },
    { key: 'engagementId', value: 'ENG-2025-1065-001', type: 'default', enabled: true },
    { key: 'entityId', value: 'ENT-ALPHA-LP', type: 'default', enabled: true },
  ],
  _postman_variable_scope: 'environment',
};

const outDir = path.join(__dirname, '../postman');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'TaxMesh.postman_collection.json'), JSON.stringify(collection, null, 2));
fs.writeFileSync(path.join(outDir, 'TaxMesh.postman_environment.json'), JSON.stringify(env, null, 2));

const countReqs = (items) =>
  items.reduce((n, it) => n + (it.item ? countReqs(it.item) : 1), 0);

console.log(`Wrote postman/TaxMesh.postman_collection.json (${countReqs(collection.item)} requests)`);
console.log('Wrote postman/TaxMesh.postman_environment.json');
