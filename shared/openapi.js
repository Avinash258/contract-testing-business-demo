const { SERVICES, CONTRACTS, GATEWAY_PORT } = require('./contracts');
const { PAYLOADS } = require('./payloads');

function buildOpenApi() {
  const paths = {
    '/api/health': {
      get: {
        tags: ['Gateway'],
        summary: 'Gateway + all service health',
        operationId: 'getGatewayHealth',
        responses: {
          200: { description: 'Health snapshot', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/architecture': {
      get: {
        tags: ['Gateway'],
        summary: 'Architecture catalog (services, contracts, matrix)',
        operationId: 'getArchitecture',
        responses: {
          200: { description: 'Architecture document', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/contracts/{id}': {
      get: {
        tags: ['Gateway'],
        summary: 'Contract metadata + sample payload',
        operationId: 'getContractById',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', example: 'CT-01' },
            description: 'Contract id CT-01 … CT-17',
          },
        ],
        responses: {
          200: { description: 'Contract detail' },
          404: { description: 'Unknown contract' },
        },
      },
    },
    '/api/filing': {
      get: {
        tags: ['Filing — Form 1065'],
        summary: 'Engagement filing snapshot (CEM→Forms journey)',
        operationId: 'getFiling',
        responses: { 200: { description: 'Full engagement + steps + gates' } },
      },
    },
    '/api/filing/reset': {
      post: {
        tags: ['Filing — Form 1065'],
        summary: 'Reset demo engagement to draft',
        operationId: 'resetFiling',
        responses: { 200: { description: 'Fresh snapshot' } },
      },
    },
    '/api/filing/run/{stepId}': {
      post: {
        tags: ['Filing — Form 1065'],
        summary: 'Run one filing stage (cem|setup|books|tax|allocate|forms|efile)',
        operationId: 'runFilingStep',
        parameters: [
          {
            name: 'stepId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              enum: ['cem', 'setup', 'books', 'tax', 'allocate', 'forms', 'efile'],
            },
          },
        ],
        responses: {
          200: { description: 'Updated snapshot' },
          400: { description: 'Business rule / sequencing error' },
        },
      },
    },
    '/api/filing/run-all': {
      post: {
        tags: ['Filing — Form 1065'],
        summary: 'Run full CEM→MAD→CAM→TIM→RPAM→Forms→MeF journey',
        operationId: 'runFilingAll',
        responses: { 200: { description: 'Completed engagement snapshot' } },
      },
    },
    '/api/filing/form1065': {
      get: {
        tags: ['Filing — Form 1065'],
        summary: 'Form 1065 lines, K-1s, package & e-file artifacts',
        operationId: 'getForm1065',
        responses: { 200: { description: 'Return artifacts' } },
      },
    },
    '/api/filing/gates': {
      get: {
        tags: ['Filing — Form 1065'],
        summary: 'API quality gates AQG1–AQG5',
        operationId: 'getQualityGates',
        responses: { 200: { description: 'Gate statuses' } },
      },
    },
    '/api/filing/jobs': {
      get: {
        tags: ['Filing — Form 1065'],
        summary: 'Async import / recalc / print jobs',
        operationId: 'getFilingJobs',
        responses: { 200: { description: 'Job history' } },
      },
    },
    '/api/filing/datasets': {
      get: {
        tags: ['Filing — Form 1065'],
        summary: 'List 5 demo CEM/MAD/CAM Excel datasets',
        operationId: 'listExcelDatasets',
        responses: { 200: { description: 'Dataset index' } },
      },
    },
    '/api/filing/upload/cem': {
      post: {
        tags: ['Filing — Form 1065'],
        summary: 'Upload CEM engagement Excel (.xlsx)',
        operationId: 'uploadCemExcel',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: { file: { type: 'string', format: 'binary' } },
                required: ['file'],
              },
            },
          },
        },
        responses: { 200: { description: 'Imported CEM context' }, 400: { description: 'Parse/validation error' } },
      },
    },
    '/api/filing/upload/mad': {
      post: {
        tags: ['Filing — Form 1065'],
        summary: 'Upload MAD master-data Excel (.xlsx)',
        operationId: 'uploadMadExcel',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: { file: { type: 'string', format: 'binary' } },
                required: ['file'],
              },
            },
          },
        },
        responses: { 200: { description: 'Imported entity + partners' }, 400: { description: 'Parse/validation error' } },
      },
    },
    '/api/filing/upload/cam': {
      post: {
        tags: ['Filing — Form 1065'],
        summary: 'Upload CAM trial-balance Excel (.xlsx)',
        operationId: 'uploadCamExcel',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: { file: { type: 'string', format: 'binary' } },
                required: ['file'],
              },
            },
          },
        },
        responses: { 200: { description: 'Imported trial balance' }, 400: { description: 'Parse/validation error' } },
      },
    },
  };

  for (const id of Object.keys(SERVICES)) {
    const svc = SERVICES[id];
    const base = `/api/proxy/${id}`;

    paths[`${base}/health`] = {
      get: {
        tags: [`Service ${id} — ${svc.name}`],
        summary: `${svc.name} health`,
        operationId: `health_${id}`,
        responses: { 200: { description: 'Service health' } },
      },
    };

    paths[`${base}/contracts`] = {
      get: {
        tags: [`Service ${id} — ${svc.name}`],
        summary: `Contracts produced/consumed by ${svc.name}`,
        operationId: `contracts_${id}`,
        responses: { 200: { description: 'Contract lists' } },
      },
    };

    paths[`${base}/pipeline`] = {
      get: {
        tags: [`Service ${id} — ${svc.name}`],
        summary: `Probe all contracts consumed by ${svc.name}`,
        operationId: `pipeline_${id}`,
        responses: { 200: { description: 'Consumed contract reachability' } },
      },
    };

    paths[`${base}/consume/{contractId}`] = {
      get: {
        tags: [`Service ${id} — ${svc.name}`],
        summary: `Pull a producer payload consumed by ${svc.name}`,
        operationId: `consume_${id}`,
        parameters: [
          {
            name: 'contractId',
            in: 'path',
            required: true,
            schema: { type: 'string', example: 'CT-01' },
          },
        ],
        responses: {
          200: { description: 'Consumed payload wrapper' },
          404: { description: 'Not a consumer of this contract' },
          502: { description: 'Producer unreachable' },
        },
      },
    };
  }

  for (const ct of CONTRACTS) {
    const svc = SERVICES[ct.producer];
    const gatewayPath = `/api/proxy/${ct.producer}${ct.path}`;
    paths[gatewayPath] = {
      get: {
        tags: [`Service ${ct.producer} — ${svc.name}`, 'Contracts CT-01…CT-17'],
        summary: `${ct.id}: ${ct.title}`,
        description: `**${ct.direction}** contract · Producer **${ct.producer}** → Consumer **${ct.consumer}**`,
        operationId: ct.id.replace('-', '_'),
        responses: {
          200: {
            description: 'Contract payload',
            content: {
              'application/json': {
                schema: { type: 'object' },
                example: PAYLOADS[ct.id],
              },
            },
          },
        },
      },
    };
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'TaxMesh — Tax Demo Microservice APIs',
      version: '1.0.0',
      description: [
        'Partnership tax pipeline demo for the NV AI-driven Contract Testing case study.',
        '',
        '**Microservices (separate processes):** CEM · MAD · CAM · TIM · RPAM · Forms Print',
        '',
        '**Contracts:** CT-00 … CT-17',
        '',
        'Gateway proxies under `/api/proxy/{CEM|MAD|CAM|TIM|RPAM|FORMS}/...`.',
        'Excel uploads are owned by CEM / MAD / CAM microservices (`POST /upload`).',
      ].join('\n'),
      contact: { name: 'TaxMesh Demo' },
    },
    servers: [
      { url: `http://127.0.0.1:${GATEWAY_PORT}`, description: 'Local gateway' },
      { url: 'http://localhost:4100', description: 'Localhost alias' },
    ],
    tags: [
      { name: 'Gateway', description: 'Aggregation & catalog APIs' },
      {
        name: 'Filing — Form 1065',
        description:
          'US partnership filing journey: CEM → MAD → CAM → TIM → RPAM → ERE/Forms Print → MeF (case study)',
      },
      { name: 'Contracts CT-01…CT-17', description: 'Producer contract payloads' },
      ...Object.values(SERVICES).map((s) => ({
        name: `Service ${s.id} — ${s.name}`,
        description: `${s.code || s.id} · ${s.role} · port ${s.port}`,
      })),
    ],
    paths,
  };
}

module.exports = { buildOpenApi };
