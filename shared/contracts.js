/**
 * Six separate microservices (case study):
 * CLM · MDM · ACC · TAX · ALC · DOC
 *
 * Legacy codes (still accepted as aliases): CEM MAD CAM TIM RPAM FORMS
 * Letter aliases: A=MDM B=ACC C=TAX D=ALC E=DOC
 *
 * CT-01…CT-17 = MDM/ACC/TAX/ALC/DOC mesh.
 * CT-00 = CLM → MDM engagement context.
 */

const SERVICES = {
  CLM: {
    id: 'CLM',
    key: 'clm',
    code: 'CLM',
    name: 'Client Management',
    role: 'Engagement, project, entity group & job context',
    port: 4201,
    out: 1,
    in: 0,
  },
  MDM: {
    id: 'MDM',
    key: 'mdm',
    code: 'MDM',
    name: 'Master Data',
    role: 'Legal entities, ownership, SALT & contacts',
    port: 4202,
    out: 4,
    in: 5,
  },
  ACC: {
    id: 'ACC',
    key: 'acc',
    code: 'ACC',
    name: 'Accounting',
    role: 'Chart of accounts, mappings & adjustments',
    port: 4203,
    out: 3,
    in: 2,
  },
  TAX: {
    id: 'TAX',
    key: 'tax',
    code: 'TAX',
    name: 'Tax Computation',
    role: 'Forms import, federal / state recalculation',
    port: 4204,
    out: 4,
    in: 4,
  },
  ALC: {
    id: 'ALC',
    key: 'alc',
    code: 'ALC',
    name: 'Allocations',
    role: 'Partner capital, allocate & tier',
    port: 4205,
    out: 3,
    in: 4,
  },
  DOC: {
    id: 'DOC',
    key: 'doc',
    code: 'DOC',
    name: 'Forms & Documents',
    role: 'Reporting sync & final print package',
    port: 4206,
    out: 3,
    in: 3,
  },
};

/** Map old case-study codes + letter aliases → current service ids */
const SERVICE_ALIASES = {
  CEM: 'CLM',
  MAD: 'MDM',
  CAM: 'ACC',
  TIM: 'TAX',
  RPAM: 'ALC',
  FORMS: 'DOC',
  A: 'MDM',
  B: 'ACC',
  C: 'TAX',
  D: 'ALC',
  E: 'DOC',
};

function resolveServiceId(serviceId) {
  const raw = String(serviceId || '').toUpperCase();
  return SERVICE_ALIASES[raw] || raw;
}

/** @type {Array<{id:string, producer:string, consumer:string, direction:'downstream'|'reverse', path:string, title:string}>} */
const CONTRACTS = [
  {
    id: 'CT-00',
    producer: 'CLM',
    consumer: 'MDM',
    direction: 'downstream',
    path: '/contracts/ct-00/engagement-context',
    title: 'Engagement / project / job context',
  },
  { id: 'CT-01', producer: 'MDM', consumer: 'ACC', direction: 'downstream', path: '/contracts/ct-01/entities', title: 'Entities for account mapping' },
  { id: 'CT-02', producer: 'MDM', consumer: 'TAX', direction: 'downstream', path: '/contracts/ct-02/tax-attributes', title: 'Entity tax attributes' },
  { id: 'CT-03', producer: 'MDM', consumer: 'ALC', direction: 'downstream', path: '/contracts/ct-03/ownership', title: 'Partner ownership' },
  { id: 'CT-04', producer: 'MDM', consumer: 'DOC', direction: 'downstream', path: '/contracts/ct-04/filing-meta', title: 'Filing metadata' },
  { id: 'CT-05', producer: 'ACC', consumer: 'MDM', direction: 'reverse', path: '/contracts/ct-05/mapping-gaps', title: 'Missing entity / account codes' },
  { id: 'CT-06', producer: 'ACC', consumer: 'TAX', direction: 'downstream', path: '/contracts/ct-06/book-balances', title: 'Book account balances' },
  { id: 'CT-07', producer: 'ACC', consumer: 'ALC', direction: 'downstream', path: '/contracts/ct-07/capital-map', title: 'Capital account mappings' },
  { id: 'CT-08', producer: 'TAX', consumer: 'MDM', direction: 'reverse', path: '/contracts/ct-08/attribute-gaps', title: 'Tax attribute corrections' },
  { id: 'CT-09', producer: 'TAX', consumer: 'ACC', direction: 'reverse', path: '/contracts/ct-09/btt-asks', title: 'Book-to-tax reconciling asks' },
  { id: 'CT-10', producer: 'TAX', consumer: 'ALC', direction: 'downstream', path: '/contracts/ct-10/taxable-income', title: 'Taxable income buckets' },
  { id: 'CT-11', producer: 'TAX', consumer: 'DOC', direction: 'downstream', path: '/contracts/ct-11/tax-summary', title: 'Tax computation summary' },
  { id: 'CT-12', producer: 'ALC', consumer: 'MDM', direction: 'reverse', path: '/contracts/ct-12/ownership-issues', title: 'Ownership validation issues' },
  { id: 'CT-13', producer: 'ALC', consumer: 'TAX', direction: 'reverse', path: '/contracts/ct-13/allocation-needs', title: 'Adjusted tax amount needs' },
  { id: 'CT-14', producer: 'ALC', consumer: 'DOC', direction: 'downstream', path: '/contracts/ct-14/partner-allocations', title: 'Partner allocation / K-1 data' },
  { id: 'CT-15', producer: 'DOC', consumer: 'MDM', direction: 'reverse', path: '/contracts/ct-15/entity-print-needs', title: 'Legal name / EIN for forms' },
  { id: 'CT-16', producer: 'DOC', consumer: 'TAX', direction: 'reverse', path: '/contracts/ct-16/tax-line-needs', title: 'Tax line amounts for forms' },
  { id: 'CT-17', producer: 'DOC', consumer: 'ALC', direction: 'reverse', path: '/contracts/ct-17/capital-restatement', title: 'Partner capital restatement' },
];

function urlFor(serviceId, path) {
  const id = resolveServiceId(serviceId);
  const svc = SERVICES[id];
  if (!svc) throw new Error(`Unknown service ${serviceId}`);
  const base = process.env[`URL_${id}`] || process.env[`URL_${serviceId}`] || `http://127.0.0.1:${svc.port}`;
  return `${base}${path}`;
}

function contractsProducedBy(serviceId) {
  const id = resolveServiceId(serviceId);
  return CONTRACTS.filter((c) => c.producer === id);
}

function contractsConsumedBy(serviceId) {
  const id = resolveServiceId(serviceId);
  return CONTRACTS.filter((c) => c.consumer === id);
}

/** Map API direction names: upstream ≡ reverse (feedback asks). */
function normalizeDirection(direction) {
  const d = String(direction || '').toLowerCase();
  if (d === 'upstream' || d === 'reverse' || d === 'up') return 'reverse';
  if (d === 'downstream' || d === 'down') return 'downstream';
  return null;
}

function apiDirection(contractDirection) {
  return contractDirection === 'reverse' ? 'upstream' : 'downstream';
}

function withApiDirection(ct) {
  return { ...ct, flow: apiDirection(ct.direction) };
}

function contractsProducedByDirection(serviceId, direction) {
  const dir = normalizeDirection(direction);
  if (!dir) return [];
  return contractsProducedBy(serviceId).filter((c) => c.direction === dir).map(withApiDirection);
}

function contractsConsumedByDirection(serviceId, direction) {
  const dir = normalizeDirection(direction);
  if (!dir) return [];
  return contractsConsumedBy(serviceId).filter((c) => c.direction === dir).map(withApiDirection);
}

/** Contracts from producer → consumer, optionally filtered by direction. */
function contractsBetween(fromId, toId, direction) {
  const from = resolveServiceId(fromId);
  const to = resolveServiceId(toId);
  const dir = direction ? normalizeDirection(direction) : null;
  return CONTRACTS.filter(
    (c) => c.producer === from && c.consumer === to && (!dir || c.direction === dir)
  ).map(withApiDirection);
}

function flowSummary(serviceId) {
  const id = resolveServiceId(serviceId);
  const produced = contractsProducedBy(id).map(withApiDirection);
  const consumed = contractsConsumedBy(id).map(withApiDirection);
  return {
    service: id,
    downstream: {
      produced: produced.filter((c) => c.flow === 'downstream'),
      consumed: consumed.filter((c) => c.flow === 'downstream'),
      peersOut: [...new Set(produced.filter((c) => c.flow === 'downstream').map((c) => c.consumer))],
      peersIn: [...new Set(consumed.filter((c) => c.flow === 'downstream').map((c) => c.producer))],
    },
    upstream: {
      produced: produced.filter((c) => c.flow === 'upstream'),
      consumed: consumed.filter((c) => c.flow === 'upstream'),
      peersOut: [...new Set(produced.filter((c) => c.flow === 'upstream').map((c) => c.consumer))],
      peersIn: [...new Set(consumed.filter((c) => c.flow === 'upstream').map((c) => c.producer))],
    },
  };
}

function allFlowEdges() {
  return CONTRACTS.map((c) => ({
    id: c.id,
    from: c.producer,
    to: c.consumer,
    direction: c.direction,
    flow: apiDirection(c.direction),
    path: c.path,
    title: c.title,
  }));
}

module.exports = {
  SERVICES,
  SERVICE_ALIASES,
  resolveServiceId,
  CONTRACTS,
  urlFor,
  contractsProducedBy,
  contractsConsumedBy,
  normalizeDirection,
  apiDirection,
  withApiDirection,
  contractsProducedByDirection,
  contractsConsumedByDirection,
  contractsBetween,
  flowSummary,
  allFlowEdges,
  GATEWAY_PORT: Number(process.env.GATEWAY_PORT || 4200),
  JOURNEY: ['CLM', 'MDM', 'ACC', 'TAX', 'ALC', 'DOC'],
  SERVICE_ORDER: ['CLM', 'MDM', 'ACC', 'TAX', 'ALC', 'DOC'],
};
