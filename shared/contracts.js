/**
 * Six separate microservices (case study):
 * CEM · MAD · CAM · TIM · RPAM · Forms Print
 *
 * CT-01…CT-17 = MAD/CAM/TIM/RPAM/Forms mesh (was A–E).
 * CT-00 = CEM → MAD engagement context.
 */

const SERVICES = {
  CEM: {
    id: 'CEM',
    key: 'cem',
    code: 'CEM',
    name: 'Client Engagement',
    role: 'Engagement, project, entity group & job context',
    port: 4101,
    out: 1,
    in: 0,
  },
  MAD: {
    id: 'MAD',
    key: 'mad',
    code: 'MAD',
    name: 'Master Data',
    role: 'Legal entities, ownership, SALT & contacts',
    port: 4102,
    out: 4,
    in: 5,
  },
  CAM: {
    id: 'CAM',
    key: 'cam',
    code: 'CAM',
    name: 'Accounting',
    role: 'Chart of accounts, mappings & adjustments',
    port: 4103,
    out: 3,
    in: 2,
  },
  TIM: {
    id: 'TIM',
    key: 'tim',
    code: 'TIM',
    name: 'Tax Engine',
    role: 'Forms import, federal / state recalculation',
    port: 4104,
    out: 4,
    in: 4,
  },
  RPAM: {
    id: 'RPAM',
    key: 'rpam',
    code: 'RPAM',
    name: 'Allocations',
    role: 'Partner capital, allocate & tier',
    port: 4105,
    out: 3,
    in: 4,
  },
  FORMS: {
    id: 'FORMS',
    key: 'forms-print',
    code: 'Forms Print',
    name: 'Forms & Print',
    role: 'Reporting sync & final print package',
    port: 4106,
    out: 3,
    in: 3,
  },
};

/** @type {Array<{id:string, producer:string, consumer:string, direction:'downstream'|'reverse', path:string, title:string}>} */
const CONTRACTS = [
  {
    id: 'CT-00',
    producer: 'CEM',
    consumer: 'MAD',
    direction: 'downstream',
    path: '/contracts/ct-00/engagement-context',
    title: 'Engagement / project / job context',
  },
  { id: 'CT-01', producer: 'MAD', consumer: 'CAM', direction: 'downstream', path: '/contracts/ct-01/entities', title: 'Entities for account mapping' },
  { id: 'CT-02', producer: 'MAD', consumer: 'TIM', direction: 'downstream', path: '/contracts/ct-02/tax-attributes', title: 'Entity tax attributes' },
  { id: 'CT-03', producer: 'MAD', consumer: 'RPAM', direction: 'downstream', path: '/contracts/ct-03/ownership', title: 'Partner ownership' },
  { id: 'CT-04', producer: 'MAD', consumer: 'FORMS', direction: 'downstream', path: '/contracts/ct-04/filing-meta', title: 'Filing metadata' },
  { id: 'CT-05', producer: 'CAM', consumer: 'MAD', direction: 'reverse', path: '/contracts/ct-05/mapping-gaps', title: 'Missing entity / account codes' },
  { id: 'CT-06', producer: 'CAM', consumer: 'TIM', direction: 'downstream', path: '/contracts/ct-06/book-balances', title: 'Book account balances' },
  { id: 'CT-07', producer: 'CAM', consumer: 'RPAM', direction: 'downstream', path: '/contracts/ct-07/capital-map', title: 'Capital account mappings' },
  { id: 'CT-08', producer: 'TIM', consumer: 'MAD', direction: 'reverse', path: '/contracts/ct-08/attribute-gaps', title: 'Tax attribute corrections' },
  { id: 'CT-09', producer: 'TIM', consumer: 'CAM', direction: 'reverse', path: '/contracts/ct-09/btt-asks', title: 'Book-to-tax reconciling asks' },
  { id: 'CT-10', producer: 'TIM', consumer: 'RPAM', direction: 'downstream', path: '/contracts/ct-10/taxable-income', title: 'Taxable income buckets' },
  { id: 'CT-11', producer: 'TIM', consumer: 'FORMS', direction: 'downstream', path: '/contracts/ct-11/tax-summary', title: 'Tax computation summary' },
  { id: 'CT-12', producer: 'RPAM', consumer: 'MAD', direction: 'reverse', path: '/contracts/ct-12/ownership-issues', title: 'Ownership validation issues' },
  { id: 'CT-13', producer: 'RPAM', consumer: 'TIM', direction: 'reverse', path: '/contracts/ct-13/allocation-needs', title: 'Adjusted tax amount needs' },
  { id: 'CT-14', producer: 'RPAM', consumer: 'FORMS', direction: 'downstream', path: '/contracts/ct-14/partner-allocations', title: 'Partner allocation / K-1 data' },
  { id: 'CT-15', producer: 'FORMS', consumer: 'MAD', direction: 'reverse', path: '/contracts/ct-15/entity-print-needs', title: 'Legal name / EIN for forms' },
  { id: 'CT-16', producer: 'FORMS', consumer: 'TIM', direction: 'reverse', path: '/contracts/ct-16/tax-line-needs', title: 'Tax line amounts for forms' },
  { id: 'CT-17', producer: 'FORMS', consumer: 'RPAM', direction: 'reverse', path: '/contracts/ct-17/capital-restatement', title: 'Partner capital restatement' },
];

function urlFor(serviceId, path) {
  const id = String(serviceId).toUpperCase();
  const svc = SERVICES[id];
  if (!svc) throw new Error(`Unknown service ${serviceId}`);
  const base = process.env[`URL_${id}`] || `http://127.0.0.1:${svc.port}`;
  return `${base}${path}`;
}

function contractsProducedBy(serviceId) {
  const id = String(serviceId).toUpperCase();
  return CONTRACTS.filter((c) => c.producer === id);
}

function contractsConsumedBy(serviceId) {
  const id = String(serviceId).toUpperCase();
  return CONTRACTS.filter((c) => c.consumer === id);
}

module.exports = {
  SERVICES,
  CONTRACTS,
  urlFor,
  contractsProducedBy,
  contractsConsumedBy,
  GATEWAY_PORT: Number(process.env.GATEWAY_PORT || 4100),
  JOURNEY: ['CEM', 'MAD', 'CAM', 'TIM', 'RPAM', 'Forms Print'],
  SERVICE_ORDER: ['CEM', 'MAD', 'CAM', 'TIM', 'RPAM', 'FORMS'],
};
