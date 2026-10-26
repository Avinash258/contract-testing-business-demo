const fs = require('fs');
const path = require('path');
const { SERVICES, CONTRACTS } = require('../shared/contracts');
const { PAYLOADS } = require('../shared/payloads');

function req(name, urlPath, description) {
  return {
    name,
    request: {
      method: 'GET',
      header: [{ key: 'Accept', value: 'application/json' }],
      url: `{{baseUrl}}${urlPath}`,
      description: description || '',
    },
  };
}

function reqPost(name, urlPath, description) {
  return {
    name,
    request: {
      method: 'POST',
      header: [{ key: 'Accept', value: 'application/json' }],
      url: `{{baseUrl}}${urlPath}`,
      description: description || '',
    },
  };
}

const gateway = {
  name: '00 Gateway',
  item: [
    req('Health — all services', '/api/health', 'Gateway + A–E health snapshot'),
    req('Architecture catalog', '/api/architecture', 'Services, contracts, matrix'),
    req('Contract CT-01 detail', '/api/contracts/CT-01', 'Metadata + sample payload'),
    req('OpenAPI JSON', '/openapi.json', 'OpenAPI 3.0 document'),
  ],
};

const filing = {
  name: '01 Filing — Form 1065 journey',
  item: [
    req('GET filing snapshot', '/api/filing', 'CEM→Forms engagement state'),
    reqPost('Reset engagement', '/api/filing/reset'),
    reqPost('Run CEM', '/api/filing/run/cem'),
    reqPost('Run MAD setup', '/api/filing/run/setup'),
    reqPost('Run CAM books', '/api/filing/run/books'),
    reqPost('Run TIM tax', '/api/filing/run/tax'),
    reqPost('Run RPAM allocate', '/api/filing/run/allocate'),
    reqPost('Run Forms Print', '/api/filing/run/forms'),
    reqPost('Run MeF e-file', '/api/filing/run/efile'),
    reqPost('Run full journey', '/api/filing/run-all'),
    req('Form 1065 artifacts', '/api/filing/form1065'),
    req('Quality gates AQG1-5', '/api/filing/gates'),
    req('Async jobs', '/api/filing/jobs'),
  ],
};

const byService = {};
for (const id of Object.keys(SERVICES)) {
  const s = SERVICES[id];
  byService[id] = {
    name: `Service ${id} — ${s.name}`,
    item: [
      req(`${id} health`, `/api/proxy/${id}/health`),
      req(`${id} contracts catalog`, `/api/proxy/${id}/contracts`),
      req(`${id} pipeline probe`, `/api/proxy/${id}/pipeline`),
    ],
  };
}

for (const ct of CONTRACTS) {
  byService[ct.producer].item.push(
    req(
      `${ct.id} produce ${ct.producer}→${ct.consumer} (${ct.direction})`,
      `/api/proxy/${ct.producer}${ct.path}`,
      `${ct.title}\n\nSample:\n${JSON.stringify(PAYLOADS[ct.id], null, 2)}`
    )
  );
  byService[ct.consumer].item.push(
    req(
      `${ct.id} consume as ${ct.consumer}`,
      `/api/proxy/${ct.consumer}/consume/${ct.id}`,
      'Consumer pull of producer payload'
    )
  );
}

const collection = {
  info: {
    name: 'TaxMesh — Tax Demo Microservices',
    description:
      'Partnership tax pipeline APIs for the NV Contract Testing case study. 5 services · 17 contracts (CT-01…CT-17). Import with the TaxMesh environment.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [{ key: 'baseUrl', value: 'http://127.0.0.1:4100' }],
  item: [gateway, filing, ...Object.values(byService)],
};

const env = {
  id: 'taxmesh-local',
  name: 'TaxMesh Local',
  values: [
    { key: 'baseUrl', value: 'http://127.0.0.1:4100', enabled: true },
    { key: 'engagementId', value: 'ENG-2025-1065-001', enabled: true },
    { key: 'entityId', value: 'ENT-ALPHA-LP', enabled: true },
  ],
  _postman_variable_scope: 'environment',
};

const outDir = path.join(__dirname, '../postman');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'TaxMesh.postman_collection.json'), JSON.stringify(collection, null, 2));
fs.writeFileSync(path.join(outDir, 'TaxMesh.postman_environment.json'), JSON.stringify(env, null, 2));
console.log('Wrote postman/TaxMesh.postman_collection.json');
console.log('Wrote postman/TaxMesh.postman_environment.json');
