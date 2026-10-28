const { SERVICES, CONTRACTS, GATEWAY_PORT } = require('./contracts');
const { PAYLOADS } = require('./payloads');

function buildOpenApi(options = {}) {
  const publicBase = String(options.serverUrl || process.env.PUBLIC_BASE_URL || '')
    .trim()
    .replace(/\/$/, '');
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
    '/api/contracts': {
      get: {
        tags: ['Gateway', 'Data flow'],
        summary: 'List contracts (filter by direction / producer / consumer)',
        operationId: 'listContracts',
        parameters: [
          { name: 'direction', in: 'query', schema: { type: 'string', enum: ['downstream', 'upstream', 'reverse'] } },
          { name: 'producer', in: 'query', schema: { type: 'string', example: 'MDM' } },
          { name: 'consumer', in: 'query', schema: { type: 'string', example: 'TAX' } },
        ],
        responses: { 200: { description: 'Filtered contract list' } },
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
            description: 'Contract id CT-00 … CT-17',
          },
        ],
        responses: {
          200: { description: 'Contract detail' },
          404: { description: 'Unknown contract' },
        },
      },
    },
    '/api/flow': {
      get: {
        tags: ['Gateway', 'Data flow'],
        summary: 'Full downstream + upstream data-flow catalog across all modules',
        operationId: 'getFlowCatalog',
        responses: { 200: { description: 'Services, edges, endpoint map' } },
      },
    },
    '/api/flow/edges': {
      get: {
        tags: ['Gateway', 'Data flow'],
        summary: 'All CT edges (optional direction filter)',
        operationId: 'getFlowEdges',
        parameters: [
          { name: 'direction', in: 'query', schema: { type: 'string', enum: ['downstream', 'upstream'] } },
        ],
        responses: { 200: { description: 'Edge list' } },
      },
    },
    '/api/flow/downstream/{from}/{to}': {
      get: {
        tags: ['Gateway', 'Data flow'],
        summary: 'Downstream contracts + live payloads from → to',
        operationId: 'getFlowDownstreamPair',
        parameters: [
          { name: 'from', in: 'path', required: true, schema: { type: 'string', example: 'MDM' } },
          { name: 'to', in: 'path', required: true, schema: { type: 'string', example: 'TAX' } },
        ],
        responses: { 200: { description: 'Pair payloads' }, 404: { description: 'No downstream edge' } },
      },
    },
    '/api/flow/upstream/{from}/{to}': {
      get: {
        tags: ['Gateway', 'Data flow'],
        summary: 'Upstream (reverse ask) contracts + live payloads from → to',
        operationId: 'getFlowUpstreamPair',
        parameters: [
          { name: 'from', in: 'path', required: true, schema: { type: 'string', example: 'TAX' } },
          { name: 'to', in: 'path', required: true, schema: { type: 'string', example: 'MDM' } },
        ],
        responses: { 200: { description: 'Pair payloads' }, 404: { description: 'No upstream edge' } },
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
        summary: 'List 5 demo CLM/MDM/ACC Excel datasets (files: clm/mdm/acc.xlsx)',
        operationId: 'listExcelDatasets',
        responses: { 200: { description: 'Dataset index' } },
      },
    },
    '/api/filing/upload/clm': {
      post: {
        tags: ['Filing — Form 1065'],
        summary: 'Upload CLM engagement Excel (.xlsx)',
        operationId: 'uploadClmExcel',
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
        responses: { 200: { description: 'Imported CLM context' }, 400: { description: 'Parse/validation error' } },
      },
    },
    '/api/filing/upload/mdm': {
      post: {
        tags: ['Filing — Form 1065'],
        summary: 'Upload MDM master-data Excel (.xlsx)',
        operationId: 'uploadMdmExcel',
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
    '/api/filing/upload/acc': {
      post: {
        tags: ['Filing — Form 1065'],
        summary: 'Upload ACC trial-balance Excel (.xlsx)',
        operationId: 'uploadAccExcel',
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
        responses: { 200: { description: 'Imported trial balance; runs TAX→ALC→DOC' }, 400: { description: 'Parse/validation error' } },
      },
    },
    '/api/filing/validate/tax': {
      get: {
        tags: ['Filing — Form 1065'],
        summary: 'TAX business validation',
        operationId: 'validateTax',
        responses: { 200: { description: 'Validation passed' }, 422: { description: 'Validation failed' } },
      },
    },
    '/api/filing/validate/alc': {
      get: {
        tags: ['Filing — Form 1065'],
        summary: 'ALC business validation',
        operationId: 'validateAlc',
        responses: { 200: { description: 'Validation passed' }, 422: { description: 'Validation failed' } },
      },
    },
    '/api/filing/tax/calculate': {
      post: {
        tags: ['Filing — Form 1065'],
        summary: 'Run TAX computation',
        operationId: 'calculateTax',
        responses: { 200: { description: 'Tax computed' }, 422: { description: 'Blocked by validation' } },
      },
    },
    '/api/filing/alc/allocate': {
      post: {
        tags: ['Filing — Form 1065'],
        summary: 'Run ALC partner allocations',
        operationId: 'allocateAlc',
        responses: { 200: { description: 'Allocated' }, 422: { description: 'Blocked by validation' } },
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

    if (id === 'CLM') {
      paths[`${base}/v2/engagement`] = {
        get: {
          tags: [`Service CLM — ${svc.name}`, 'API v2'],
          summary: 'CLM v2 — engagement snapshot',
          operationId: 'clm_v2_engagement',
          responses: { 200: { description: 'Engagement + import metadata (engagement.taxYear is a string, e.g. "2025")' } },
        },
        patch: {
          tags: [`Service CLM — ${svc.name}`, 'API v2'],
          summary: 'CLM v2 — patch engagement fields',
          operationId: 'clm_v2_engagement_patch',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    entityName: { type: 'string' },
                    taxYear: { type: 'integer' },
                    dueDate: { type: 'string' },
                    formType: { type: 'string' },
                    jurisdiction: { type: 'string' },
                    states: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Updated' },
            409: { description: 'No engagement' },
            422: { description: 'No updatable fields — body { apiVersion, errors: [{ code, message, allowed }] }' },
          },
        },
      };
      paths[`${base}/v2/status`] = {
        get: {
          tags: [`Service CLM — ${svc.name}`, 'API v2'],
          summary: 'CLM v2 — readiness status',
          operationId: 'clm_v2_status',
          responses: { 200: { description: 'isReady flag + ids' } },
        },
      };
    }

    if (id === 'MDM') {
      paths[`${base}/v2/entity`] = {
        get: {
          tags: [`Service MDM — ${svc.name}`, 'API v2'],
          summary: 'MDM v2 — entity master (legacy MAD)',
          operationId: 'mdm_v2_entity',
          responses: { 200: { description: 'Entity' }, 404: { description: 'Not loaded' } },
        },
      };
      paths[`${base}/v2/partners`] = {
        get: {
          tags: [`Service MDM — ${svc.name}`, 'API v2'],
          summary: 'MDM v2 — partners list',
          operationId: 'mdm_v2_partners',
          responses: { 200: { description: 'Partners' }, 404: { description: 'Not loaded' } },
        },
      };
      paths[`${base}/v2/ownership`] = {
        get: {
          tags: [`Service MDM — ${svc.name}`, 'API v2'],
          summary: 'MDM v2 — ownership totals / validity',
          operationId: 'mdm_v2_ownership',
          responses: { 200: { description: 'Ownership summary' }, 404: { description: 'Not loaded' } },
        },
      };
      paths[`${base}/v2/status`] = {
        get: {
          tags: [`Service MDM — ${svc.name}`, 'API v2'],
          summary: 'MDM v2 — readiness status',
          operationId: 'mdm_v2_status',
          responses: { 200: { description: 'Ready flag + entity/partners' } },
        },
      };
    }

    paths[`${base}/contracts`] = {
      get: {
        tags: [`Service ${id} — ${svc.name}`],
        summary: `Contracts produced/consumed by ${svc.name}`,
        operationId: `contracts_${id}`,
        responses: { 200: { description: 'Contract lists' } },
      },
    };

    paths[`${base}/flow`] = {
      get: {
        tags: [`Service ${id} — ${svc.name}`, 'Data flow'],
        summary: `${svc.name} downstream + upstream peers and contracts`,
        operationId: `flow_${id}`,
        responses: { 200: { description: 'Flow summary' } },
      },
    };

    paths[`${base}/contracts/downstream`] = {
      get: {
        tags: [`Service ${id} — ${svc.name}`, 'Data flow'],
        summary: `${svc.name} downstream contracts`,
        operationId: `contracts_downstream_${id}`,
        responses: { 200: { description: 'Downstream produced/consumed' } },
      },
    };

    paths[`${base}/contracts/upstream`] = {
      get: {
        tags: [`Service ${id} — ${svc.name}`, 'Data flow'],
        summary: `${svc.name} upstream (reverse) contracts`,
        operationId: `contracts_upstream_${id}`,
        responses: { 200: { description: 'Upstream produced/consumed' } },
      },
    };

    paths[`${base}/downstream/{peerId}`] = {
      get: {
        tags: [`Service ${id} — ${svc.name}`, 'Data flow'],
        summary: `Downstream payloads ${id} → peer`,
        operationId: `downstream_peer_${id}`,
        parameters: [{ name: 'peerId', in: 'path', required: true, schema: { type: 'string', example: 'TAX' } }],
        responses: { 200: { description: 'Payloads' }, 404: { description: 'No edge' } },
      },
    };

    paths[`${base}/upstream/{peerId}`] = {
      get: {
        tags: [`Service ${id} — ${svc.name}`, 'Data flow'],
        summary: `Upstream payloads ${id} → peer`,
        operationId: `upstream_peer_${id}`,
        parameters: [{ name: 'peerId', in: 'path', required: true, schema: { type: 'string', example: 'MDM' } }],
        responses: { 200: { description: 'Payloads' }, 404: { description: 'No edge' } },
      },
    };

    paths[`${base}/consume/downstream`] = {
      get: {
        tags: [`Service ${id} — ${svc.name}`, 'Data flow'],
        summary: `Batch-pull all downstream inputs for ${svc.name}`,
        operationId: `consume_downstream_${id}`,
        responses: { 200: { description: 'Batch consume results' } },
      },
    };

    paths[`${base}/consume/upstream`] = {
      get: {
        tags: [`Service ${id} — ${svc.name}`, 'Data flow'],
        summary: `Batch-pull all upstream inputs for ${svc.name}`,
        operationId: `consume_upstream_${id}`,
        responses: { 200: { description: 'Batch consume results' } },
      },
    };

    paths[`${base}/pipeline`] = {
      get: {
        tags: [`Service ${id} — ${svc.name}`],
        summary: `Probe contracts consumed by ${svc.name} (?direction=downstream|upstream)`,
        operationId: `pipeline_${id}`,
        parameters: [
          { name: 'direction', in: 'query', schema: { type: 'string', enum: ['downstream', 'upstream'] } },
        ],
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
        '**Microservices:** CLM · MDM · ACC · TAX · ALC · DOC',
        '',
        '**Contracts:** CT-00 … CT-17 (downstream + upstream/reverse)',
        '',
        '**Data flow APIs:** `/api/flow`, `/api/proxy/{svc}/downstream/{peer}`, `/api/proxy/{svc}/upstream/{peer}`',
        '',
        'Gateway proxies under `/api/proxy/{CLM|MDM|ACC|TAX|ALC|DOC}/...` (legacy CEM/MAD/… aliases work).',
        'Excel uploads are owned by CLM / MDM / ACC (`POST /upload`).',
      ].join('\n'),
      contact: { name: 'TaxMesh Demo' },
    },
    servers: [
      // Relative URL so Swagger "Try it out" works behind Cloudflare / reverse proxies
      { url: '/', description: 'This host (same origin)' },
      ...(publicBase && !/127\.0\.0\.1|localhost/i.test(publicBase)
        ? [{ url: publicBase, description: 'Public / tunnel URL' }]
        : []),
      { url: `http://127.0.0.1:${GATEWAY_PORT}`, description: 'Local gateway only' },
    ],
    tags: [
      { name: 'Gateway', description: 'Aggregation & catalog APIs' },
      { name: 'Data flow', description: 'Downstream (forward) and upstream (reverse ask) APIs between modules' },
      { name: 'API v2', description: 'Branch v2 richer CLM + MDM (MAD) endpoints under /v2/*' },
      {
        name: 'Filing — Form 1065',
        description:
          'US partnership filing journey: CLM → MDM → ACC → TAX → ALC → DOC → MeF',
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
