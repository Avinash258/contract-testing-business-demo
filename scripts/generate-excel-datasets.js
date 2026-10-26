/**
 * Generates 5 CEM / MAD / CAM Excel datasets for TaxMesh upload demos.
 * set-01 = compact baseline; set-02…05 = dynamic, higher-volume data.
 */
const fs = require('fs');
const path = require('path');
const { XLSX, writeSheet } = require('../shared/excelImport');

const ROOT = path.join(__dirname, '../testdata');

/** Simple deterministic PRNG so regenerations stay stable. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function money(n) {
  return Math.round(Number(n));
}

function pick(rand, list) {
  return list[Math.floor(rand() * list.length) % list.length];
}

function scale(rand, base, variance = 0.35) {
  const factor = 1 + (rand() * 2 - 1) * variance;
  return money(base * factor);
}

const FIRST = ['Avery', 'Blake', 'Cameron', 'Dana', 'Ellis', 'Finley', 'Harper', 'Jordan', 'Kai', 'Logan', 'Morgan', 'Noah', 'Parker', 'Quinn', 'Riley', 'Sage', 'Taylor'];
const LAST = ['Chen', 'Diaz', 'Brooks', 'Nguyen', 'Patel', 'Ortiz', 'Kim', 'Walsh', 'Singh', 'Reyes', 'Foster', 'Bennett', 'Hayes', 'Coleman'];
const ENTITY_PARTNERS = ['Horizon Trust', 'Northbridge Capital LLC', 'Summit Holdings Inc', 'Prairie Family Trust', 'Coastal Advisors LP'];

/**
 * Build a full Schedule L / K / M-1 style trial balance.
 * Keeps TIM driver codes 4000 / 5000 / 6100 / 6200 while adding many more rows.
 */
function buildTrialBalance(rand, profile) {
  const {
    cash,
    ar,
    inventory,
    prepaid,
    ppe,
    accumDep,
    ap,
    accrued,
    notesPayable,
    ordinary,
    gp,
    bookDep,
    meals,
    interestInc,
    rentalInc,
    cogs,
    salaries,
    rentExp,
    utilities,
    professional,
    travel,
    charity,
    fines,
    taxExemptInterest,
  } = profile;

  return [
    // Schedule L — assets
    { accountCode: '1000', accountName: 'Cash and cash equivalents', bookAmount: cash, schedule: 'L' },
    { accountCode: '1100', accountName: 'Accounts receivable', bookAmount: ar, schedule: 'L' },
    { accountCode: '1200', accountName: 'Inventory', bookAmount: inventory, schedule: 'L' },
    { accountCode: '1300', accountName: 'Prepaid expenses', bookAmount: prepaid, schedule: 'L' },
    { accountCode: '1500', accountName: 'Depreciable assets (gross)', bookAmount: ppe, schedule: 'L' },
    { accountCode: '1700', accountName: 'Accumulated depreciation', bookAmount: -Math.abs(accumDep), schedule: 'L' },
    { accountCode: '1800', accountName: 'Other assets', bookAmount: scale(rand, cash * 0.15, 0.4), schedule: 'L' },
    // Schedule L — liabilities
    { accountCode: '2000', accountName: 'Accounts payable', bookAmount: -Math.abs(ap), schedule: 'L' },
    { accountCode: '2100', accountName: 'Accrued expenses', bookAmount: -Math.abs(accrued), schedule: 'L' },
    { accountCode: '2200', accountName: 'Notes payable', bookAmount: -Math.abs(notesPayable), schedule: 'L' },
    // Schedule K — income / deductions (book)
    { accountCode: '4000', accountName: 'Ordinary business income (book)', bookAmount: ordinary, schedule: 'K' },
    { accountCode: '4100', accountName: 'Interest income', bookAmount: interestInc, schedule: 'K' },
    { accountCode: '4200', accountName: 'Rental real estate income', bookAmount: rentalInc, schedule: 'K' },
    { accountCode: '4300', accountName: 'Tax-exempt interest', bookAmount: taxExemptInterest, schedule: 'K' },
    { accountCode: '5000', accountName: 'Guaranteed payments to partners', bookAmount: gp, schedule: 'K' },
    { accountCode: '5100', accountName: 'Cost of goods sold', bookAmount: -Math.abs(cogs), schedule: 'K' },
    { accountCode: '5200', accountName: 'Salaries and wages', bookAmount: -Math.abs(salaries), schedule: 'K' },
    { accountCode: '5300', accountName: 'Rent expense', bookAmount: -Math.abs(rentExp), schedule: 'K' },
    { accountCode: '5400', accountName: 'Utilities', bookAmount: -Math.abs(utilities), schedule: 'K' },
    { accountCode: '5500', accountName: 'Professional fees', bookAmount: -Math.abs(professional), schedule: 'K' },
    { accountCode: '5600', accountName: 'Travel and entertainment', bookAmount: -Math.abs(travel), schedule: 'K' },
    // Schedule M-1 — book-to-tax
    { accountCode: '6100', accountName: 'Book depreciation', bookAmount: -Math.abs(bookDep), schedule: 'M-1' },
    { accountCode: '6200', accountName: 'Meals (50% nondeductible)', bookAmount: -Math.abs(meals), schedule: 'M-1' },
    { accountCode: '6300', accountName: 'Charitable contributions (book)', bookAmount: -Math.abs(charity), schedule: 'M-1' },
    { accountCode: '6400', accountName: 'Fines and penalties (nondeductible)', bookAmount: -Math.abs(fines), schedule: 'M-1' },
    { accountCode: '6500', accountName: 'Officer life insurance premiums', bookAmount: -scale(rand, 4000, 0.5), schedule: 'M-1' },
  ];
}

function buildPartners(rand, count, capitalBase, prefix) {
  const partners = [];
  let remaining = 100;
  const weights = [];

  for (let i = 0; i < count; i++) {
    weights.push(0.5 + rand());
  }
  const weightSum = weights.reduce((a, b) => a + b, 0);

  for (let i = 0; i < count; i++) {
    const isEntity = i === count - 1 && count >= 3 && rand() > 0.4;
    let ownershipPct;
    if (i === count - 1) {
      ownershipPct = money(remaining * 100) / 100;
    } else {
      ownershipPct = Math.round((weights[i] / weightSum) * 1000) / 10;
      // keep one decimal; leave room for last partner
      if (ownershipPct < 5) ownershipPct = 5;
      if (ownershipPct > remaining - 5 * (count - i - 1)) {
        ownershipPct = Math.max(5, remaining - 5 * (count - i - 1));
      }
      ownershipPct = Math.round(ownershipPct * 10) / 10;
      remaining = Math.round((remaining - ownershipPct) * 10) / 10;
    }

    const idNum = prefix + (i + 1);
    const name = isEntity
      ? pick(rand, ENTITY_PARTNERS)
      : `${pick(rand, FIRST)} ${pick(rand, LAST)}`;

    const beg = scale(rand, capitalBase * (ownershipPct / 100), 0.25);
    const contrib = rand() > 0.35 ? scale(rand, beg * 0.12, 0.6) : 0;
    const dist = scale(rand, beg * (0.08 + rand() * 0.12), 0.4);

    partners.push({
      partnerId: `P-${String(idNum).padStart(3, '0')}`,
      name,
      tin: isEntity ? `**-***${String(1000 + Math.floor(rand() * 8999))}` : `***-**-${String(1000 + Math.floor(rand() * 8999))}`,
      type: isEntity ? 'entity' : 'individual',
      ownershipPct,
      profitPct: ownershipPct,
      lossPct: ownershipPct,
      capitalAccount: `CA-${String(idNum).padStart(3, '0')}`,
      beginningCapital: beg,
      contributions: contrib,
      distributions: dist,
    });
  }

  // Fix floating ownership to exactly 100
  const sum = partners.reduce((a, p) => a + p.ownershipPct, 0);
  const delta = Math.round((100 - sum) * 10) / 10;
  partners[partners.length - 1].ownershipPct = Math.round((partners[partners.length - 1].ownershipPct + delta) * 10) / 10;
  partners[partners.length - 1].profitPct = partners[partners.length - 1].ownershipPct;
  partners[partners.length - 1].lossPct = partners[partners.length - 1].ownershipPct;

  return partners;
}

function buildDynamicSet(spec) {
  const rand = rng(spec.seed);
  const partners = buildPartners(rand, spec.partnerCount, spec.capitalBase, spec.partnerPrefix);

  const ordinary = scale(rand, spec.ordinaryBase, 0.2);
  const gp = scale(rand, ordinary * 0.09, 0.3);
  const bookDep = scale(rand, ordinary * 0.05, 0.35);
  const meals = scale(rand, ordinary * 0.012, 0.5);

  const trialBalance = buildTrialBalance(rand, {
    cash: scale(rand, spec.cashBase, 0.3),
    ar: scale(rand, spec.cashBase * 0.55, 0.4),
    inventory: scale(rand, spec.cashBase * 0.4, 0.5),
    prepaid: scale(rand, 18000, 0.6),
    ppe: scale(rand, spec.ppeBase, 0.25),
    accumDep: scale(rand, spec.ppeBase * 0.28, 0.3),
    ap: scale(rand, spec.cashBase * 0.35, 0.4),
    accrued: scale(rand, 45000, 0.5),
    notesPayable: scale(rand, spec.ppeBase * 0.22, 0.35),
    ordinary,
    gp,
    bookDep,
    meals,
    interestInc: scale(rand, 18000, 0.5),
    rentalInc: scale(rand, 35000, 0.6),
    cogs: scale(rand, ordinary * 0.35, 0.3),
    salaries: scale(rand, ordinary * 0.22, 0.35),
    rentExp: scale(rand, 72000, 0.4),
    utilities: scale(rand, 18000, 0.45),
    professional: scale(rand, 42000, 0.5),
    travel: scale(rand, 16000, 0.55),
    charity: scale(rand, 9000, 0.6),
    fines: scale(rand, 2500, 0.8),
    taxExemptInterest: scale(rand, 6000, 0.5),
  });

  return {
    id: spec.id,
    label: spec.label,
    cem: {
      ...spec.cem,
      entityName: spec.cem.entityName || spec.entity.legalName,
    },
    entity: spec.entity,
    partners,
    trialBalance,
  };
}

const SET_01 = {
  id: 'set-01',
  label: 'Alpha Partners LP (baseline NY/CA)',
  cem: {
    clientId: 'CLI-NV-TAX-01',
    engagementId: 'ENG-2025-1065-001',
    projectId: 'PRJ-ALPHA-1065-2025',
    entityGroupId: 'EG-ALPHA',
    jobId: 'JOB-TY2025-001',
    entityName: 'Alpha Partners LP',
    taxYear: 2025,
    dueDate: '2026-03-15',
    formType: '1065',
    jurisdiction: 'US-FED',
    states: 'NY|CA',
  },
  entity: {
    entityId: 'ENT-ALPHA-LP',
    legalName: 'Alpha Partners LP',
    ein: '12-3456789',
    entityType: 'partnership',
    addressLine1: '100 Wall Street',
    city: 'New York',
    state: 'NY',
    zip: '10005',
    fiscalYearEnd: '12-31',
    dateBusinessStarted: '2018-01-01',
    section754Election: 'Yes',
    multiState: 'Yes',
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
    { accountCode: '1000', accountName: 'Cash', bookAmount: 210000, schedule: 'L' },
    { accountCode: '1500', accountName: 'Depreciable assets', bookAmount: 890000, schedule: 'L' },
    { accountCode: '1700', accountName: 'Accumulated depreciation', bookAmount: -245000, schedule: 'L' },
    { accountCode: '4000', accountName: 'Ordinary income', bookAmount: 1250000, schedule: 'K' },
    { accountCode: '5000', accountName: 'Guaranteed payments', bookAmount: 80000, schedule: 'K' },
    { accountCode: '6100', accountName: 'Book depreciation', bookAmount: -45000, schedule: 'M-1' },
    { accountCode: '6200', accountName: 'Meals (50% nondeductible)', bookAmount: -12000, schedule: 'M-1' },
  ],
};

const DYNAMIC_SPECS = [
  {
    id: 'set-02',
    label: 'Beta Holdings LP (TX/FL — 3 partners, full TB)',
    seed: 202502,
    partnerCount: 3,
    partnerPrefix: 100,
    capitalBase: 1400000,
    cashBase: 380000,
    ppeBase: 1450000,
    ordinaryBase: 1120000,
    cem: {
      clientId: 'CLI-NV-TAX-02',
      engagementId: 'ENG-2025-1065-002',
      projectId: 'PRJ-BETA-1065-2025',
      entityGroupId: 'EG-BETA',
      jobId: 'JOB-TY2025-002',
      taxYear: 2025,
      dueDate: '2026-03-15',
      formType: '1065',
      jurisdiction: 'US-FED',
      states: 'TX|FL|GA',
    },
    entity: {
      entityId: 'ENT-BETA-LP',
      legalName: 'Beta Holdings LP',
      ein: '45-9988776',
      entityType: 'partnership',
      addressLine1: '500 Congress Ave',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      fiscalYearEnd: '12-31',
      dateBusinessStarted: '2015-06-15',
      section754Election: 'No',
      multiState: 'Yes',
    },
  },
  {
    id: 'set-03',
    label: 'Gamma Ventures LP (CA — 4 partners, full TB)',
    seed: 202503,
    partnerCount: 4,
    partnerPrefix: 200,
    capitalBase: 980000,
    cashBase: 165000,
    ppeBase: 720000,
    ordinaryBase: 780000,
    cem: {
      clientId: 'CLI-NV-TAX-03',
      engagementId: 'ENG-2025-1065-003',
      projectId: 'PRJ-GAMMA-1065-2025',
      entityGroupId: 'EG-GAMMA',
      jobId: 'JOB-TY2025-003',
      taxYear: 2025,
      dueDate: '2026-03-15',
      formType: '1065',
      jurisdiction: 'US-FED',
      states: 'CA',
    },
    entity: {
      entityId: 'ENT-GAMMA-LP',
      legalName: 'Gamma Ventures LP',
      ein: '33-1122334',
      entityType: 'partnership',
      addressLine1: '1 Market St Suite 2400',
      city: 'San Francisco',
      state: 'CA',
      zip: '94105',
      fiscalYearEnd: '12-31',
      dateBusinessStarted: '2020-03-01',
      section754Election: 'Yes',
      multiState: 'No',
    },
  },
  {
    id: 'set-04',
    label: 'Delta Capital LP (NY/NJ/CT — 5 partners, full TB)',
    seed: 202504,
    partnerCount: 5,
    partnerPrefix: 300,
    capitalBase: 2800000,
    cashBase: 620000,
    ppeBase: 2400000,
    ordinaryBase: 2350000,
    cem: {
      clientId: 'CLI-NV-TAX-04',
      engagementId: 'ENG-2025-1065-004',
      projectId: 'PRJ-DELTA-1065-2025',
      entityGroupId: 'EG-DELTA',
      jobId: 'JOB-TY2025-004',
      taxYear: 2025,
      dueDate: '2026-09-15',
      formType: '1065',
      jurisdiction: 'US-FED',
      states: 'NY|NJ|CT|PA',
    },
    entity: {
      entityId: 'ENT-DELTA-LP',
      legalName: 'Delta Capital LP',
      ein: '81-5566778',
      entityType: 'partnership',
      addressLine1: '200 Park Ave Fl 42',
      city: 'New York',
      state: 'NY',
      zip: '10166',
      fiscalYearEnd: '12-31',
      dateBusinessStarted: '2012-09-30',
      section754Election: 'Yes',
      multiState: 'Yes',
    },
  },
  {
    id: 'set-05',
    label: 'Epsilon Fund LP (IL/OH/MI — 4 partners, high M-1)',
    seed: 202505,
    partnerCount: 4,
    partnerPrefix: 400,
    capitalBase: 1600000,
    cashBase: 310000,
    ppeBase: 1180000,
    ordinaryBase: 980000,
    cem: {
      clientId: 'CLI-NV-TAX-05',
      engagementId: 'ENG-2025-1065-005',
      projectId: 'PRJ-EPSILON-1065-2025',
      entityGroupId: 'EG-EPSILON',
      jobId: 'JOB-TY2025-005',
      taxYear: 2025,
      dueDate: '2026-03-15',
      formType: '1065',
      jurisdiction: 'US-FED',
      states: 'IL|OH|MI',
    },
    entity: {
      entityId: 'ENT-EPSILON-LP',
      legalName: 'Epsilon Fund LP',
      ein: '27-4455667',
      entityType: 'partnership',
      addressLine1: '233 S Wacker Dr',
      city: 'Chicago',
      state: 'IL',
      zip: '60606',
      fiscalYearEnd: '12-31',
      dateBusinessStarted: '2019-11-12',
      section754Election: 'No',
      multiState: 'Yes',
    },
  },
];

function writeWorkbook(filePath, sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    writeSheet(wb, name, rows);
  }
  XLSX.writeFile(wb, filePath);
}

function main() {
  fs.mkdirSync(ROOT, { recursive: true });
  const datasets = [SET_01, ...DYNAMIC_SPECS.map(buildDynamicSet)];
  const index = [];

  for (const ds of datasets) {
    const dir = path.join(ROOT, ds.id);
    fs.mkdirSync(dir, { recursive: true });

    writeWorkbook(path.join(dir, 'cem.xlsx'), { Engagement: [ds.cem] });
    writeWorkbook(path.join(dir, 'mad.xlsx'), { Entity: [ds.entity], Partners: ds.partners });
    writeWorkbook(path.join(dir, 'cam.xlsx'), { TrialBalance: ds.trialBalance });

    index.push({
      id: ds.id,
      label: ds.label,
      files: {
        cem: `/testdata/${ds.id}/cem.xlsx`,
        mad: `/testdata/${ds.id}/mad.xlsx`,
        cam: `/testdata/${ds.id}/cam.xlsx`,
      },
      meta: {
        partners: ds.partners.length,
        accounts: ds.trialBalance.length,
      },
    });

    console.log(
      `Wrote ${ds.id}: ${ds.label} — ${ds.partners.length} partners, ${ds.trialBalance.length} TB accounts`
    );
  }

  fs.writeFileSync(path.join(ROOT, 'index.json'), JSON.stringify({ datasets: index }, null, 2));
  console.log(`\nWrote testdata/index.json (${index.length} sets)`);
}

main();
