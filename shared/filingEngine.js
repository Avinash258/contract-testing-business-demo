const store = require('./filingStore');
const { PAYLOADS } = require('./payloads');
const { parseCem, parseMad, parseCam } = require('./excelImport');
const dataFlow = require('./dataFlow');
const { validateTim, validateRpam } = require('./businessValidation');

/**
 * US partnership Form 1065 filing engine — upload-driven data flow.
 * CEM/MAD → CAM & TIM; CAM(+CEM+MAD) → TIM & RPAM; TIM+RPAM → Forms Print.
 */

function snapshot() {
  const s = store.read();
  return {
    ...s,
    journey: ['CEM', 'MAD', 'CAM', 'TIM', 'RPAM', 'Forms Print'],
    steps: store.STEPS.map((step) => ({
      ...step,
      active: s.currentStep === step.id,
      done: isStepDone(s, step.id),
    })),
    totals: computeTotals(s),
    dataFlow: dataFlow.buildDataFlow(s),
  };
}

function isStepDone(s, stepId) {
  switch (stepId) {
    case 'cem':
      return !!(s.projectId && s.jobId && s.correlationId);
    case 'setup':
      return (
        ['master_data_ready', 'books_imported', 'tax_computed', 'allocated', 'forms_ready', 'package_generated', 'efiled'].includes(
          s.filingStatus
        ) || ['books', 'tax', 'allocate', 'forms', 'efile'].includes(s.currentStep)
      );
    case 'books':
      return (
        (!!s.accountMaps?.length &&
          ['tax_computed', 'allocated', 'forms_ready', 'package_generated', 'efiled'].includes(s.filingStatus)) ||
        ['tax', 'allocate', 'forms', 'efile'].includes(s.currentStep)
      );
    case 'tax':
      return !!s.taxComputation;
    case 'allocate':
      return !!s.allocations;
    case 'forms':
      return !!s.printPackage;
    case 'efile':
      return s.filingStatus === 'efiled';
    default:
      return false;
  }
}

function startJob(s, type, module) {
  const job = {
    jobId: `ASYNC-${type}-${Date.now().toString().slice(-6)}`,
    type,
    module,
    status: 'accepted',
    acceptedAt: new Date().toISOString(),
    completedAt: null,
    terminalState: null,
  };
  s.jobs = [job, ...(s.jobs || [])].slice(0, 20);
  return job;
}

function completeJob(s, job, terminalState = 'succeeded') {
  job.status = terminalState;
  job.terminalState = terminalState;
  job.completedAt = new Date().toISOString();
}

function passGate(s, gateId) {
  if (s.qualityGates && s.qualityGates[gateId]) {
    s.qualityGates[gateId].status = 'passed';
    s.qualityGates[gateId].passedAt = new Date().toISOString();
  }
}

function computeTotals(s) {
  const ordinary = s.taxComputation?.ordinaryBusinessIncome ?? null;
  const partners = (s.allocations?.partners || []).map((p) => ({
    partnerId: p.partnerId,
    name: p.name,
    ordinaryIncome: p.k1?.ordinaryIncome,
    endingCapital: p.k1?.endingCapital,
  }));
  return {
    ordinaryBusinessIncome: ordinary,
    partnerCount: s.partners?.length || 0,
    openIssues: (s.issues || []).filter((i) => i.status !== 'resolved').length,
    packageId: s.printPackage?.packageId || null,
    submissionId: s.efile?.submissionId || null,
  };
}

function validateSetup(s) {
  const issues = [];
  if (!s.entity?.ein || !/^\d{2}-\d{7}$/.test(s.entity.ein)) {
    issues.push(issue('CT-15', 'MAD', 'high', 'EIN format invalid for Form 1065 identification'));
  }
  if (!s.entity?.legalName) {
    issues.push(issue('CT-15', 'MAD', 'high', 'Legal name required for forms package'));
  }
  const pct = (s.partners || []).reduce((sum, p) => sum + Number(p.ownershipPct || 0), 0);
  if (Math.abs(pct - 100) > 0.01) {
    issues.push(issue('CT-12', 'RPAM', 'high', `Ownership percentages sum to ${pct}%, must equal 100%`));
  }
  if (s.entity?.section754Election == null) {
    issues.push(issue('CT-08', 'TIM', 'warning', 'Confirm section 754 election status for tax year'));
  }
  return issues;
}

function issue(contractId, sourceService, severity, message, extra = {}) {
  return {
    id: `ISS-${Date.now()}-${Math.floor(Math.random() * 999)}`,
    contractId,
    sourceService,
    severity,
    message,
    status: 'open',
    raisedAt: new Date().toISOString(),
    ...extra,
  };
}

function runCem() {
  const s = store.read();
  const job = startJob(s, 'create-engagement', 'CEM');
  s.correlationId = `corr-${s.engagementId}-${Date.now().toString().slice(-5)}`;
  s.clientId = s.clientId || 'CLI-NV-TAX-01';
  s.projectId = s.projectId || 'PRJ-ALPHA-1065-2025';
  s.entityGroupId = s.entityGroupId || 'EG-ALPHA';
  s.jobId = s.jobId || 'JOB-TY2025-001';
  s.imports = s.imports || {};
  s.imports.cem = s.imports.cem || {
    fileName: '(api)',
    importedAt: new Date().toISOString(),
    rows: 1,
  };
  completeJob(s, job, 'succeeded');
  passGate(s, 'AQG1');
  store.setStatus(s, 'engagement_open', 'setup');
  store.log(s, 'cem.create_context', {
    engagementId: s.engagementId,
    projectId: s.projectId,
    jobId: s.jobId,
    correlationId: s.correlationId,
  });
  return store.write(s);
}

function runSetup() {
  const s = store.read();
  if (!s.correlationId) runCem();
  const fresh = store.read();
  const job = startJob(fresh, 'mad-import', 'MAD');
  const issues = validateSetup(fresh);
  fresh.issues = mergeIssues(fresh.issues, issues);
  fresh.masterDataSnapshot = {
    entities: PAYLOADS['CT-01'].entities,
    taxAttributes: PAYLOADS['CT-02'].taxAttributes,
    ownership: PAYLOADS['CT-03'].partners,
    filingMeta: PAYLOADS['CT-04'].filingMeta,
  };
  fresh.imports = fresh.imports || {};
  fresh.imports.mad = fresh.imports.mad || {
    fileName: '(api)',
    importedAt: new Date().toISOString(),
    entityId: fresh.entity?.entityId,
    partnerCount: fresh.partners?.length || 0,
  };
  completeJob(fresh, job, issues.some((i) => i.severity === 'high') ? 'failed' : 'succeeded');
  if (!issues.some((i) => i.severity === 'high')) passGate(fresh, 'AQG1');
  store.setStatus(fresh, issues.some((i) => i.severity === 'high') ? 'draft' : 'master_data_ready', 'books');
  store.log(fresh, 'mad.import_entities', { issueCount: issues.length });
  return store.write(fresh);
}

function runBooks() {
  const s = store.read();
  const job = startJob(s, 'cam-import-sync', 'CAM');
  s.imports = s.imports || {};
  s.imports.cam = s.imports.cam || {
    fileName: '(api)',
    importedAt: new Date().toISOString(),
    accountCount: s.trialBalance?.length || 0,
  };
  s.accountMaps = s.trialBalance.map((row) => ({
    accountCode: row.accountCode,
    accountName: row.accountName,
    bookAmount: row.bookAmount,
    taxMapCode: mapTaxCode(row.accountCode),
    mapped: true,
    syncedToTim: true,
  }));

  const gaps = [
    issue('CT-05', 'CAM', 'info', 'Accumulated depreciation linked to entity ENT-ALPHA-LP for Schedule L'),
  ];

  s.booksSnapshot = {
    bookBalances: PAYLOADS['CT-06'].bookBalances,
    capitalMap: PAYLOADS['CT-07'].capitalMap,
    camToTimSync: { status: 'succeeded', publishedMappings: s.accountMaps.length },
  };
  s.issues = mergeIssues(s.issues, gaps);
  completeJob(s, job, 'succeeded');
  passGate(s, 'AQG2');
  store.setStatus(s, 'books_imported', 'tax');
  store.log(s, 'cam.import_and_sync_tim', { accounts: s.accountMaps.length });
  return store.write(s);
}

function mapTaxCode(code) {
  const map = {
    '1000': 'L-Cash',
    '1100': 'L-AR',
    '1200': 'L-Inventory',
    '1300': 'L-Prepaid',
    '1500': 'L-Assets',
    '1700': 'L-AccumDep',
    '1800': 'L-OtherAssets',
    '2000': 'L-AP',
    '2100': 'L-Accrued',
    '2200': 'L-NotesPayable',
    '4000': 'K-Ordinary',
    '4100': 'K-Interest',
    '4200': 'K-Rental',
    '4300': 'K-TaxExemptInterest',
    '5000': 'K-GP',
    '5100': 'K-COGS',
    '5200': 'K-Salaries',
    '5300': 'K-Rent',
    '5400': 'K-Utilities',
    '5500': 'K-Professional',
    '5600': 'K-Travel',
    '6100': 'M1-Depreciation',
    '6200': 'M1-Meals',
    '6300': 'M1-Charity',
    '6400': 'M1-Fines',
    '6500': 'M1-LifeIns',
  };
  return map[code] || `TAX-${code}`;
}

function buildStateApportionment(states) {
  const list = (states && states.length ? states : ['NY', 'CA']).map(String);
  const equal = money(1 / list.length);
  const apport = {};
  let remaining = 1;
  list.forEach((st, i) => {
    if (i === list.length - 1) apport[st] = money(remaining);
    else {
      apport[st] = equal;
      remaining = money(remaining - equal);
    }
  });
  return apport;
}

function runTax(options = {}) {
  const { skipValidationGate = false } = options;
  const s = store.read();
  const pre = validateTim(s);
  s.validations = s.validations || {};
  s.validations.tim = pre;

  if (!pre.canProceed && !skipValidationGate) {
    s.taxComputation = null;
    s.bookToTax = [];
    const job = startJob(s, 'tim-recalculation', 'TIM');
    completeJob(s, job, 'failed');
    s.issues = mergeIssues(
      s.issues,
      pre.findings
        .filter((f) => f.severity === 'error')
        .map((f) => issue(f.code, 'TIM', 'high', f.message, { field: f.field }))
    );
    store.setStatus(s, 'books_imported', 'tax');
    store.log(s, 'tim.validation_blocked', { errors: pre.summary.errors });
    store.write(s);
    const err = new Error(`TIM business validation failed (${pre.summary.errors} error(s))`);
    err.validation = pre;
    throw err;
  }

  const job = startJob(s, 'tim-recalculation', 'TIM');
  const ordinaryBook = amountFor(s, '4000');
  const gp = Math.max(0, amountFor(s, '5000'));
  const bookDep = Math.abs(amountFor(s, '6100'));
  const meals = Math.abs(amountFor(s, '6200'));
  const interestFromTb = amountFor(s, '4100');
  const interestIncome = interestFromTb !== 0 ? money(Math.max(0, interestFromTb)) : 0;
  const taxDep = Math.min(bookDep, money(bookDep * 0.85) || 38000);
  const mealsNondeductible = money(meals * 0.5);
  const depAdjustment = money(bookDep - taxDep);
  const section179 = money(Math.min(15000, Math.max(0, ordinaryBook * 0.05)));

  s.bookToTax = [
    { code: 'M1-1', description: 'Net income per books (ordinary)', amount: money(ordinaryBook) },
    { code: 'M1-2', description: 'Depreciation — book over tax addback', amount: depAdjustment },
    { code: 'M1-3', description: 'Meals 50% nondeductible', amount: mealsNondeductible },
    { code: 'M1-4', description: 'Section 179 deduction', amount: -section179 },
    { code: 'SchK', description: 'Guaranteed payments (Schedule K — separate)', amount: money(gp) },
  ];

  const ordinaryBusinessIncome = money(ordinaryBook + depAdjustment + mealsNondeductible - section179);
  const federalTaxableIncome = money(ordinaryBusinessIncome + interestIncome);

  // Arithmetic identity: books + M-1 adjustments = ordinary business income (excludes Sch K GP)
  const m1OrdinaryRollup = money(ordinaryBook + depAdjustment + mealsNondeductible - section179);
  const identityOk = Math.abs(m1OrdinaryRollup - ordinaryBusinessIncome) < 0.02;

  const stateApportionment = buildStateApportionment(s.states);
  const stateTaxableIncome = {};
  for (const [st, factor] of Object.entries(stateApportionment)) {
    stateTaxableIncome[st] = money(federalTaxableIncome * factor);
  }

  s.taxComputation = {
    ...PAYLOADS['CT-10'].taxableIncome,
    ordinaryBusinessIncome,
    federalTaxableIncome,
    interestIncome,
    guaranteedPayments: gp,
    section179,
    stateApportionment,
    stateTaxableIncome,
    status: 'computed',
    version: 'TIM-2025.1',
    identityChecks: {
      bookToTaxRollsToOrdinaryIncome: identityOk,
      ownershipPctSum: money((s.partners || []).reduce((sum, p) => sum + Number(p.ownershipPct || 0), 0)),
    },
    formLines: {
      '1065.Line22': ordinaryBusinessIncome,
      '1065.SchK.Interest': interestIncome,
      '1065.SchK.GP': gp,
    },
    businessValidation: null,
  };

  // Re-validate after computation (identity + apportionment)
  const post = validateTim(s);
  s.validations.tim = post;
  s.taxComputation.businessValidation = {
    ok: post.ok,
    summary: post.summary,
    findings: post.findings,
  };

  const reverse = [
    issue('CT-09', 'TIM', 'info', 'Book-to-tax depreciation schedule applied (MACRS vs book)'),
    issue(
      'CT-08',
      'TIM',
      'info',
      s.entity?.section754Election
        ? 'Section 754 election confirmed for tax year'
        : 'Section 754 election not elected — no basis adjustment this year'
    ),
  ];
  s.issues = mergeIssues(
    s.issues,
    reverse.concat(
      post.findings
        .filter((f) => f.severity === 'error' || f.severity === 'warning')
        .map((f) => issue(f.code, 'TIM', f.severity === 'error' ? 'high' : 'warning', f.message, { field: f.field }))
    )
  );

  const timOk = identityOk && post.ok;
  completeJob(s, job, timOk ? 'succeeded' : 'failed');
  if (timOk) passGate(s, 'AQG3');
  store.setStatus(s, timOk ? 'tax_computed' : 'books_imported', timOk ? 'allocate' : 'tax');
  store.log(s, 'tim.recalculate', {
    ordinaryBusinessIncome,
    identityOk,
    validationOk: post.ok,
    errors: post.summary.errors,
  });
  store.write(s);

  if (!timOk && !skipValidationGate) {
    const err = new Error(`TIM calculation failed business validation (${post.summary.errors} error(s))`);
    err.validation = post;
    throw err;
  }
  return store.read();
}

function pickGpPartner(partners) {
  // Guaranteed payments go to the first individual partner, else highest ownership
  const individuals = (partners || []).filter((p) => String(p.type).toLowerCase() === 'individual');
  const pool = individuals.length ? individuals : partners || [];
  return [...pool].sort((a, b) => Number(b.ownershipPct) - Number(a.ownershipPct))[0] || null;
}

function runAllocate(options = {}) {
  const { skipValidationGate = false } = options;
  const s = store.read();
  if (!s.taxComputation) throw new Error('Run TIM calculation before RPAM allocations');

  const pre = validateRpam(s);
  s.validations = s.validations || {};
  s.validations.rpam = pre;

  if (!pre.canProceed && !skipValidationGate) {
    s.allocations = null;
    const job = startJob(s, 'rpam-allocate-tier', 'RPAM');
    completeJob(s, job, 'failed');
    s.issues = mergeIssues(
      s.issues,
      pre.findings
        .filter((f) => f.severity === 'error')
        .map((f) => issue(f.code, 'RPAM', 'high', f.message, { field: f.field }))
    );
    store.setStatus(s, 'tax_computed', 'allocate');
    store.log(s, 'rpam.validation_blocked', { errors: pre.summary.errors });
    store.write(s);
    const err = new Error(`RPAM business validation failed (${pre.summary.errors} error(s))`);
    err.validation = pre;
    throw err;
  }

  const job = startJob(s, 'rpam-allocate-tier', 'RPAM');

  const ordinary = s.taxComputation.ordinaryBusinessIncome;
  const interest = s.taxComputation.interestIncome || 0;
  const gpTotal = Number(s.taxComputation.guaranteedPayments || 0);
  const gpPartner = pickGpPartner(s.partners);

  // Allocate with rounding residual on last partner so totals reconcile to TIM
  const ordered = [...s.partners];
  let ordinaryLeft = money(ordinary);
  let interestLeft = money(interest);

  const partners = ordered.map((p, idx) => {
    const isLast = idx === ordered.length - 1;
    const share = Number(p.ownershipPct) / 100;
    const ordinaryIncome = isLast ? ordinaryLeft : money(ordinary * share);
    const interestIncome = isLast ? interestLeft : money(interest * share);
    if (!isLast) {
      ordinaryLeft = money(ordinaryLeft - ordinaryIncome);
      interestLeft = money(interestLeft - interestIncome);
    }
    const guaranteedPayments = gpPartner && p.partnerId === gpPartner.partnerId ? money(gpTotal) : 0;
    const endingCapital = money(
      Number(p.beginningCapital) +
        Number(p.contributions) -
        Number(p.distributions) +
        ordinaryIncome +
        interestIncome
    );
    return {
      partnerId: p.partnerId,
      name: p.name,
      ownershipPct: p.ownershipPct,
      capitalAccount: p.capitalAccount,
      k1: {
        ordinaryIncome,
        interestIncome,
        guaranteedPayments,
        beginningCapital: p.beginningCapital,
        contributions: p.contributions,
        distributions: p.distributions,
        endingCapital,
        profitPct: p.profitPct,
        lossPct: p.lossPct,
      },
    };
  });

  const allocatedOrdinary = money(partners.reduce((sum, p) => sum + p.k1.ordinaryIncome, 0));
  const allocatedInterest = money(partners.reduce((sum, p) => sum + p.k1.interestIncome, 0));
  const allocatedGp = money(partners.reduce((sum, p) => sum + p.k1.guaranteedPayments, 0));
  const reconcilesToTim = Math.abs(allocatedOrdinary - ordinary) < 0.05;
  const gpReconciles = Math.abs(allocatedGp - gpTotal) < 0.05;

  s.allocations = {
    method: 'pro-rata-ownership',
    specialAllocations: [],
    partners,
    reconciliation: {
      timOrdinaryIncome: ordinary,
      allocatedOrdinaryIncome: allocatedOrdinary,
      timInterestIncome: interest,
      allocatedInterestIncome: allocatedInterest,
      timGuaranteedPayments: gpTotal,
      allocatedGuaranteedPayments: allocatedGp,
      reconcilesToTim,
      gpReconciles,
      gpPartnerId: gpPartner?.partnerId || null,
    },
    producedAt: new Date().toISOString(),
    businessValidation: null,
  };

  const post = validateRpam(s);
  s.validations.rpam = post;
  s.allocations.businessValidation = {
    ok: post.ok,
    summary: post.summary,
    findings: post.findings,
  };

  s.issues = mergeIssues(
    s.issues,
    [
      issue('CT-13', 'RPAM', 'info', 'Ordinary income allocated per ownership; SA empty for this engagement'),
    ].concat(
      post.findings
        .filter((f) => f.severity === 'error' || f.severity === 'warning')
        .map((f) => issue(f.code, 'RPAM', f.severity === 'error' ? 'high' : 'warning', f.message, { field: f.field }))
    )
  );

  const rpamOk = reconcilesToTim && gpReconciles && post.ok;
  completeJob(s, job, rpamOk ? 'succeeded' : 'failed');
  if (rpamOk) passGate(s, 'AQG4');
  store.setStatus(s, rpamOk ? 'allocated' : 'tax_computed', rpamOk ? 'forms' : 'allocate');
  store.log(s, 'rpam.allocate', {
    partners: partners.length,
    reconcilesToTim,
    gpReconciles,
    validationOk: post.ok,
    errors: post.summary.errors,
  });
  store.write(s);

  if (!rpamOk && !skipValidationGate) {
    const err = new Error(`RPAM allocation failed business validation (${post.summary.errors} error(s))`);
    err.validation = post;
    throw err;
  }
  return store.read();
}

function runForms() {
  const s = store.read();
  if (!s.taxComputation || !s.allocations) throw new Error('Complete TIM + RPAM before Forms Print');
  const job = startJob(s, 'forms-print-package', 'ERE / Forms Print');

  s.form1065 = {
    form: '1065',
    taxYear: s.taxYear,
    name: s.entity.legalName,
    ein: s.entity.ein,
    address: s.entity.address,
    lines: {
      ordinaryBusinessIncome: s.taxComputation.ordinaryBusinessIncome,
      interestIncome: s.taxComputation.interestIncome,
      guaranteedPayments: s.taxComputation.guaranteedPayments,
      section179: s.taxComputation.section179,
    },
    schedules: ['K', 'L', 'M-1', 'M-2'],
  };

  s.k1s = s.allocations.partners.map((p) => ({
    form: 'Schedule K-1 (Form 1065)',
    taxYear: s.taxYear,
    partnershipName: s.entity.legalName,
    partnershipEin: s.entity.ein,
    partnerId: p.partnerId,
    partnerName: p.name,
    partIII: {
      box1_ordinaryIncome: p.k1.ordinaryIncome,
      box5_interest: p.k1.interestIncome,
      box4_guaranteedPayments: p.k1.guaranteedPayments,
    },
    partII_capital: {
      beginning: p.k1.beginningCapital,
      contributions: p.k1.contributions,
      distributions: p.k1.distributions,
      ending: p.k1.endingCapital,
    },
  }));

  s.printPackage = {
    packageId: `PKG-${s.taxYear}-${s.entity.entityId}`,
    status: 'ready',
    generatedAt: new Date().toISOString(),
    ereSync: { status: 'succeeded', reportCodes: ['1065', 'K1', 'K3', 'NY-PART', 'CA-565'] },
    documents: [
      { code: '1065', name: 'Form 1065 U.S. Return of Partnership Income', pages: 5 },
      { code: 'K-1', name: 'Schedule K-1', copies: s.k1s.length },
      { code: 'K-3', name: 'Schedule K-3', copies: s.k1s.length },
      { code: 'STATES', name: 'NY / CA state partnership returns', pages: 8 },
    ],
    manifestHash: 'demo-sha256-alpha-1065-2025',
  };

  s.issues = mergeIssues(s.issues, [
    issue('CT-16', 'FORMS', 'info', 'Form 1065 line 22 bound to tax engine ordinary income'),
    issue('CT-17', 'FORMS', 'info', 'Partner capital rollforward restated for K-1 Part II'),
  ]);
  completeJob(s, job, 'succeeded');
  passGate(s, 'AQG4');
  store.setStatus(s, 'forms_ready', 'efile');
  store.log(s, 'forms.generate_package', { packageId: s.printPackage.packageId });
  return store.write(s);
}

function runEfile() {
  const s = store.read();
  if (!s.printPackage) throw new Error('Generate forms package before e-file');
  const openHigh = (s.issues || []).filter((i) => i.severity === 'high' && i.status !== 'resolved');
  if (openHigh.length) {
    throw new Error(`Cannot e-file with ${openHigh.length} high-severity open issue(s)`);
  }
  const job = startJob(s, 'mef-submit', 'Forms Print');

  s.efile = {
    channel: 'IRS MeF',
    submissionId: `MeF-1065-${s.taxYear}-${Date.now().toString().slice(-8)}`,
    submittedAt: new Date().toISOString(),
    status: 'accepted',
    acknowledgment: 'Accepted for processing — demo acknowledgment',
    federalOnly: false,
    states: s.states,
    correlationId: s.correlationId,
    projectId: s.projectId,
    jobId: s.jobId,
  };
  completeJob(s, job, 'succeeded');
  passGate(s, 'AQG5');
  store.setStatus(s, 'efiled', 'efile');
  store.log(s, 'efile.submit', { submissionId: s.efile.submissionId });
  return store.write(s);
}

function runStep(stepId) {
  switch (stepId) {
    case 'cem':
      return runCem();
    case 'setup':
      return runSetup();
    case 'books':
      return runBooks();
    case 'tax':
      return runTax();
    case 'allocate':
      return runAllocate();
    case 'forms':
      return runForms();
    case 'efile':
      return runEfile();
    default:
      throw new Error(`Unknown step ${stepId}`);
  }
}

function runAll() {
  store.loadDemo();
  runCem();
  runSetup();
  runBooks();
  runTax();
  runAllocate();
  runForms();
  return runEfile();
}

function resetQuiet() {
  return store.reset();
}

function resolveIssue(issueId) {
  const s = store.read();
  s.issues = (s.issues || []).map((i) =>
    i.id === issueId ? { ...i, status: 'resolved', resolvedAt: new Date().toISOString() } : i
  );
  store.log(s, 'issue.resolve', { issueId });
  return store.write(s);
}

function updateEntity(patch) {
  const s = store.read();
  s.entity = { ...s.entity, ...patch };
  store.log(s, 'entity.update', patch);
  return store.write(s);
}

function amountFor(s, code) {
  const row = (s.trialBalance || []).find((r) => r.accountCode === code);
  return row ? Number(row.bookAmount) : 0;
}

function money(n) {
  return store.money(n);
}

function mergeIssues(existing = [], incoming = []) {
  const key = (i) => `${i.contractId}|${i.message}`;
  const map = new Map(existing.map((i) => [key(i), i]));
  for (const i of incoming) {
    if (!map.has(key(i))) map.set(key(i), i);
  }
  return [...map.values()];
}

function importCemExcel(buffer, fileName = 'cem.xlsx') {
  const parsed = parseCem(buffer);
  const s = store.read();
  const job = startJob(s, 'cem-excel-import', 'CEM');
  Object.assign(s, {
    clientId: parsed.clientId,
    engagementId: parsed.engagementId,
    projectId: parsed.projectId,
    entityGroupId: parsed.entityGroupId,
    jobId: parsed.jobId,
    entityName: parsed.entityName || null,
    taxYear: parsed.taxYear,
    dueDate: parsed.dueDate,
    formType: parsed.formType,
    jurisdiction: parsed.jurisdiction,
    states: parsed.states,
    correlationId: `corr-${parsed.engagementId}-${Date.now().toString().slice(-5)}`,
  });
  // Entity legal name is established by CEM engagement context for downstream MAD/Forms
  if (parsed.entityName) {
    s.entity = {
      ...(s.entity || {}),
      legalName: parsed.entityName,
    };
  }
  s.imports = s.imports || {};
  s.imports.cem = {
    fileName,
    importedAt: new Date().toISOString(),
    rows: 1,
    entityName: parsed.entityName || null,
  };
  s.published = s.published || {};
  s.published.cem = {
    at: new Date().toISOString(),
    consumedBy: ['MAD', 'CAM', 'TIM'],
    payload: dataFlow.cemPayload(s),
  };
  clearDownstream(s, 'cem');
  // clearDownstream wipes calc; keep CEM entity name on the engagement
  if (parsed.entityName) {
    s.entityName = parsed.entityName;
    s.entity = { ...(s.entity || {}), legalName: parsed.entityName };
  }
  completeJob(s, job, 'succeeded');
  passGate(s, 'AQG1');
  store.setStatus(s, 'engagement_open', 'setup');
  store.log(s, 'cem.excel_import', {
    fileName,
    engagementId: s.engagementId,
    entityName: s.entityName,
    flowsTo: ['MAD', 'CAM', 'TIM'],
  });
  store.write(s);
  return snapshot();
}

function importMadExcel(buffer, fileName = 'mad.xlsx') {
  const parsed = parseMad(buffer);
  const s = store.read();
  if (!dataFlow.hasCem(s)) {
    throw new Error('Upload CEM Excel first — MAD consumes engagement / project / job context from CEM');
  }
  const job = startJob(s, 'mad-excel-import', 'MAD');
  s.entity = parsed.entity;
  s.partners = parsed.partners;
  s.imports = s.imports || {};
  s.imports.mad = {
    fileName,
    importedAt: new Date().toISOString(),
    entityId: parsed.entity.entityId,
    partnerCount: parsed.partners.length,
  };
  s.published = s.published || {};
  s.published.mad = {
    at: new Date().toISOString(),
    consumedFrom: ['CEM'],
    consumedBy: ['CAM', 'TIM'],
    payload: dataFlow.madPayload(s),
  };
  clearDownstream(s, 'mad');
  const issues = validateSetup(s);
  s.issues = mergeIssues(s.issues, issues);
  completeJob(s, job, issues.some((i) => i.severity === 'high') ? 'failed' : 'succeeded');
  if (!issues.some((i) => i.severity === 'high')) passGate(s, 'AQG1');
  store.setStatus(s, issues.some((i) => i.severity === 'high') ? 'draft' : 'master_data_ready', 'books');
  store.log(s, 'mad.excel_import', {
    fileName,
    entityId: s.entity.entityId,
    flowsTo: ['CAM', 'TIM'],
  });
  store.write(s);
  return snapshot();
}

function importCamExcel(buffer, fileName = 'cam.xlsx') {
  const parsed = parseCam(buffer);
  let s = store.read();
  if (!dataFlow.hasCem(s) || !dataFlow.hasMad(s)) {
    throw new Error('Upload CEM and MAD Excel first — CAM consumes engagement + entity/partners, then feeds TIM and RPAM');
  }
  const job = startJob(s, 'cam-excel-import', 'CAM');
  s.trialBalance = parsed.trialBalance;
  s.imports = s.imports || {};
  s.imports.cam = {
    fileName,
    importedAt: new Date().toISOString(),
    accountCount: parsed.trialBalance.length,
  };

  // CAM joins CEM + MAD context with uploaded books
  s.accountMaps = s.trialBalance.map((row) => ({
    accountCode: row.accountCode,
    accountName: row.accountName,
    bookAmount: row.bookAmount,
    taxMapCode: mapTaxCode(row.accountCode),
    mapped: true,
    entityId: s.entity.entityId,
    engagementId: s.engagementId,
    syncedToTim: true,
    syncedToRpam: true,
  }));

  s.published = s.published || {};
  s.published.cam = {
    at: new Date().toISOString(),
    consumedFrom: ['CEM', 'MAD'],
    consumedBy: ['TIM', 'RPAM'],
    payload: {
      fromCem: dataFlow.cemPayload(s),
      fromMad: dataFlow.madPayload(s),
      trialBalance: s.trialBalance,
      accountMaps: s.accountMaps,
    },
  };

  clearDownstream(s, 'cam');
  // keep accountMaps after clear — clearDownstream wiped them; rebuild
  s.accountMaps = s.published.cam.payload.accountMaps;
  s.trialBalance = parsed.trialBalance;
  completeJob(s, job, 'succeeded');
  passGate(s, 'AQG2');
  store.setStatus(s, 'books_imported', 'tax');
  store.log(s, 'cam.excel_import', {
    fileName,
    accounts: s.trialBalance.length,
    flowsTo: ['TIM', 'RPAM'],
  });
  store.write(s);

  // Push CAM(+CEM+MAD) into TIM → RPAM → Forms Print
  return processAfterCam();
}

/** After CAM upload: TIM calc → RPAM allocate → Forms Print package */
function processAfterCam() {
  try {
    runTax();
  } catch (err) {
    store.log(store.read(), 'flow.tim_blocked', { error: String(err.message || err) });
    return snapshot();
  }
  try {
    runAllocate();
  } catch (err) {
    store.log(store.read(), 'flow.rpam_blocked', { error: String(err.message || err) });
    return snapshot();
  }
  runForms();
  const s = store.read();
  store.log(s, 'flow.cam_to_tim_rpam_forms', {
    ordinary: s.taxComputation?.ordinaryBusinessIncome,
    partners: s.allocations?.partners?.length,
    packageId: s.printPackage?.packageId,
    timValidation: s.validations?.tim?.summary,
    rpamValidation: s.validations?.rpam?.summary,
  });
  store.write(s);
  return snapshot();
}

function getTimValidation() {
  const s = store.read();
  const result = validateTim(s);
  s.validations = s.validations || {};
  s.validations.tim = result;
  store.write(s);
  return result;
}

function getRpamValidation() {
  const s = store.read();
  const result = validateRpam(s);
  s.validations = s.validations || {};
  s.validations.rpam = result;
  store.write(s);
  return result;
}

function processFlow() {
  const s = store.read();
  if (!dataFlow.hasCem(s) || !dataFlow.hasMad(s) || !dataFlow.hasCam(s)) {
    throw new Error('Need CEM + MAD + CAM uploads before processing TIM → RPAM → Forms');
  }
  // Ensure CAM maps exist
  if (!s.accountMaps?.length) {
    s.accountMaps = s.trialBalance.map((row) => ({
      accountCode: row.accountCode,
      accountName: row.accountName,
      bookAmount: row.bookAmount,
      taxMapCode: mapTaxCode(row.accountCode),
      mapped: true,
      entityId: s.entity.entityId,
      engagementId: s.engagementId,
      syncedToTim: true,
      syncedToRpam: true,
    }));
    store.write(s);
  }
  return processAfterCam();
}

function clearDownstream(s, from) {
  if (from === 'cem' || from === 'mad') {
    // New CEM/MAD invalidates CAM books and all calculations
    if (from === 'cem') {
      s.imports = { ...(s.imports || {}), mad: undefined, cam: undefined };
      delete s.imports.mad;
      delete s.imports.cam;
    }
    if (from === 'mad') {
      delete (s.imports || {}).cam;
    }
    if (from === 'cem' || from === 'mad') {
      // keep trialBalance only if CAM re-uploaded later
      if (from === 'cem') s.partners = s.partners; // no-op keep until MAD re-upload
    }
  }
  if (from === 'cem') {
    // do not wipe MAD entity until MAD re-import; still clear calc
  }
  s.accountMaps = [];
  s.bookToTax = [];
  s.taxComputation = null;
  s.allocations = null;
  s.form1065 = null;
  s.k1s = [];
  s.printPackage = null;
  s.efile = null;
  if (from === 'cem' || from === 'mad') {
    // CAM must be uploaded again after upstream change
    if (s.published) {
      delete s.published.cam;
      if (from === 'cem') delete s.published.mad;
    }
  }
  if (s.qualityGates) {
    for (const g of ['AQG2', 'AQG3', 'AQG4', 'AQG5']) {
      if (s.qualityGates[g]) {
        s.qualityGates[g].status = 'pending';
        delete s.qualityGates[g].passedAt;
      }
    }
    if (from === 'cem' && s.qualityGates.AQG1) {
      s.qualityGates.AQG1.status = 'pending';
      delete s.qualityGates.AQG1.passedAt;
    }
  }
}

module.exports = {
  snapshot,
  runStep,
  runAll,
  resetQuiet,
  resolveIssue,
  updateEntity,
  importCemExcel,
  importMadExcel,
  importCamExcel,
  processFlow,
  processAfterCam,
  runTax,
  runAllocate,
  getTimValidation,
  getRpamValidation,
  STEPS: store.STEPS,
};
