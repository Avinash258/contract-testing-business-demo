const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const STORE_PATH = path.join(DATA_DIR, 'engagement.json');

const STEPS = [
  {
    id: 'cem',
    label: 'CEM engagement',
    module: 'CEM',
    service: 'CEM',
    gate: 'AQG1',
    formHint: 'Engagement / project / entity group / job',
  },
  {
    id: 'setup',
    label: 'MAD master data',
    module: 'MAD',
    service: 'MAD',
    gate: 'AQG1',
    formHint: 'Entity + partners',
  },
  {
    id: 'books',
    label: 'CAM books',
    module: 'CAM',
    service: 'CAM',
    gate: 'AQG2',
    formHint: 'Trial balance → TIM/RPAM',
  },
  {
    id: 'tax',
    label: 'TIM tax calc',
    module: 'TIM',
    service: 'TIM',
    gate: 'AQG3',
    formHint: 'Federal / state ordinary income',
  },
  {
    id: 'allocate',
    label: 'RPAM allocate',
    module: 'RPAM',
    service: 'RPAM',
    gate: 'AQG4',
    formHint: 'Partner K-1 amounts',
  },
  {
    id: 'forms',
    label: 'Forms Print',
    module: 'Forms Print',
    service: 'FORMS',
    gate: 'AQG4',
    formHint: '1065 / K-1 package',
  },
  {
    id: 'efile',
    label: 'E-file (MeF)',
    module: 'Forms Print',
    service: 'FORMS',
    gate: 'AQG5',
    formHint: 'Full business transaction → IRS MeF acknowledgment',
  },
];

function emptyEntity() {
  return {
    entityId: null,
    legalName: null,
    ein: null,
    entityType: 'partnership',
    address: { line1: '', city: '', state: '', zip: '' },
    fiscalYearEnd: '12-31',
    dateBusinessStarted: null,
    section754Election: null,
    multiState: null,
  };
}

/** Blank filing — used on Reset and first load (upload-driven). */
function blankEngagement() {
  return {
    engagementId: null,
    clientId: null,
    projectId: null,
    entityGroupId: null,
    jobId: null,
    entityName: null,
    correlationId: null,
    taxYear: null,
    formType: '1065',
    filingStatus: 'draft',
    currentStep: 'cem',
    dueDate: null,
    jurisdiction: 'US-FED',
    states: [],
    jobs: [],
    qualityGates: {
      AQG1: { status: 'pending', label: 'CEM → MAD context & master data' },
      AQG2: { status: 'pending', label: 'MAD/CAM → TIM inputs synced' },
      AQG3: { status: 'pending', label: 'TIM calculation complete & reconciled' },
      AQG4: { status: 'pending', label: 'RPAM → ERE/Forms artifacts ready' },
      AQG5: { status: 'pending', label: 'Full business transaction accepted' },
    },
    entity: emptyEntity(),
    partners: [],
    trialBalance: [],
    accountMaps: [],
    bookToTax: [],
    taxComputation: null,
    allocations: null,
    form1065: null,
    k1s: [],
    printPackage: null,
    efile: null,
    issues: [],
    auditLog: [],
    imports: {},
    published: {},
    validations: {},
    updatedAt: new Date().toISOString(),
  };
}

/** Sample Alpha Partners data for API run-all demos (not used by UI Reset). */
function demoSeed() {
  return {
    ...blankEngagement(),
    engagementId: 'ENG-2025-1065-001',
    clientId: 'CLI-NV-TAX-01',
    projectId: 'PRJ-ALPHA-1065-2025',
    entityGroupId: 'EG-ALPHA',
    jobId: 'JOB-TY2025-001',
    entityName: 'Alpha Partners LP',
    taxYear: 2025,
    dueDate: '2026-03-15',
    states: ['NY', 'CA'],
    entity: {
      entityId: 'ENT-ALPHA-LP',
      legalName: 'Alpha Partners LP',
      ein: '12-3456789',
      entityType: 'partnership',
      address: { line1: '100 Wall Street', city: 'New York', state: 'NY', zip: '10005' },
      fiscalYearEnd: '12-31',
      dateBusinessStarted: '2018-01-01',
      section754Election: true,
      multiState: true,
    },
    partners: [
      {
        partnerId: 'P-001',
        name: 'Jordan Lee',
        tin: '***-**-4412',
        type: 'individual',
        ownershipPct: 60,
        profitPct: 60,
        lossPct: 60,
        capitalAccount: 'CA-001',
        beginningCapital: 500000,
        contributions: 0,
        distributions: 50000,
      },
      {
        partnerId: 'P-002',
        name: 'Sam Rivera',
        tin: '***-**-8831',
        type: 'individual',
        ownershipPct: 40,
        profitPct: 40,
        lossPct: 40,
        capitalAccount: 'CA-002',
        beginningCapital: 320000,
        contributions: 25000,
        distributions: 20000,
      },
    ],
    trialBalance: [
      { accountCode: '1000', accountName: 'Cash', bookAmount: 210000, taxAmount: null, schedule: 'L' },
      { accountCode: '1500', accountName: 'Depreciable assets', bookAmount: 890000, taxAmount: null, schedule: 'L' },
      { accountCode: '1700', accountName: 'Accumulated depreciation', bookAmount: -245000, taxAmount: null, schedule: 'L' },
      { accountCode: '4000', accountName: 'Ordinary income', bookAmount: 1250000, taxAmount: null, schedule: 'K' },
      { accountCode: '5000', accountName: 'Guaranteed payments', bookAmount: 80000, taxAmount: null, schedule: 'K' },
      { accountCode: '6100', accountName: 'Book depreciation', bookAmount: -45000, taxAmount: null, schedule: 'M-1' },
      { accountCode: '6200', accountName: 'Meals (50% nondeductible)', bookAmount: -12000, taxAmount: null, schedule: 'M-1' },
    ],
  };
}

/** @deprecated alias — prefer blankEngagement or demoSeed */
function seed() {
  return blankEngagement();
}

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    const s = blankEngagement();
    fs.writeFileSync(STORE_PATH, JSON.stringify(s, null, 2));
    return s;
  }
  return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
}

function read() {
  return ensure();
}

function write(next) {
  next.updatedAt = new Date().toISOString();
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(next, null, 2));
  return next;
}

function reset() {
  return write(blankEngagement());
}

function loadDemo() {
  return write(demoSeed());
}

function log(store, action, detail) {
  store.auditLog = store.auditLog || [];
  store.auditLog.unshift({ at: new Date().toISOString(), action, detail });
  store.auditLog = store.auditLog.slice(0, 40);
}

function setStatus(store, status, step) {
  store.filingStatus = status;
  if (step) store.currentStep = step;
}

function money(n) {
  return Math.round(Number(n) * 100) / 100;
}

module.exports = {
  STEPS,
  STORE_PATH,
  read,
  write,
  reset,
  loadDemo,
  log,
  setStatus,
  money,
  seed,
  blankEngagement,
  demoSeed,
};
