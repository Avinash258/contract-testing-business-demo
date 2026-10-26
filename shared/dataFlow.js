/**
 * Upload-driven taxation data flow (no contract-testing UI).
 *
 * CLM + MDM uploads  → consumed by ACC and TAX
 * ACC upload         → joins CLM + MDM + ACC books → feeds TAX and ALC
 * TAX + ALC calc     → feeds Forms & Documents (DOC)
 */

/** Upload-driven readiness — seeded demo rows alone do not light up the flow. */
function hasClm(s) {
  return !!(s.imports?.clm || s.imports?.cem || s.correlationId);
}

function hasMdm(s) {
  return !!(s.imports?.mdm || s.imports?.mad);
}

function hasAcc(s) {
  return !!(s.imports?.acc || s.imports?.cam);
}

function hasTax(s) {
  return !!s.taxComputation;
}

function hasAlc(s) {
  return !!s.allocations;
}

function hasDoc(s) {
  return !!s.printPackage;
}

// Back-compat aliases used by filingEngine
const hasCem = hasClm;
const hasMad = hasMdm;
const hasCam = hasAcc;
const hasTim = hasTax;
const hasRpam = hasAlc;
const hasForms = hasDoc;

function clmPayload(s) {
  return {
    clientId: s.clientId,
    engagementId: s.engagementId,
    projectId: s.projectId,
    entityGroupId: s.entityGroupId,
    jobId: s.jobId,
    entityName: s.entityName || s.entity?.legalName || null,
    taxYear: s.taxYear,
    dueDate: s.dueDate,
    formType: s.formType,
    jurisdiction: s.jurisdiction,
    states: s.states,
    correlationId: s.correlationId,
  };
}

const cemPayload = clmPayload;

function mdmPayload(s) {
  return {
    entity: s.entity,
    partners: s.partners,
  };
}

const madPayload = mdmPayload;

function accPayload(s) {
  return {
    trialBalance: s.trialBalance,
    accountMaps: s.accountMaps,
  };
}

const camPayload = accPayload;

function buildDataFlow(s) {
  const nodes = [
    {
      id: 'CLM',
      label: 'CLM',
      status: hasClm(s) ? 'ready' : 'empty',
      detail: hasClm(s)
        ? s.entityName || s.entity?.legalName || s.engagementId
        : 'Upload CLM Excel',
      feeds: ['MDM', 'ACC', 'TAX'],
    },
    {
      id: 'MDM',
      label: 'MDM',
      status: hasMdm(s) ? 'ready' : 'empty',
      detail: hasMdm(s)
        ? `${s.partners?.length || 0} partners · ${s.entity?.ein || 'EIN pending'}`
        : 'Upload MDM Excel (needs CLM)',
      feeds: ['ACC', 'TAX'],
      needs: ['CLM'],
    },
    {
      id: 'ACC',
      label: 'ACC',
      status: hasAcc(s) ? 'ready' : 'empty',
      detail: hasAcc(s) ? `${s.trialBalance.length} accounts` : 'Upload ACC Excel (needs CLM+MDM)',
      feeds: ['TAX', 'ALC'],
      needs: ['CLM', 'MDM'],
    },
    {
      id: 'TAX',
      label: 'TAX',
      status: hasTax(s) ? 'ready' : hasAcc(s) && hasMdm(s) && hasClm(s) ? 'waiting' : 'blocked',
      detail: hasTax(s)
        ? `Ordinary ${s.taxComputation.ordinaryBusinessIncome}`
        : 'Consumes CLM + MDM + ACC',
      feeds: ['ALC', 'DOC'],
      needs: ['CLM', 'MDM', 'ACC'],
    },
    {
      id: 'ALC',
      label: 'ALC',
      status: hasAlc(s) ? 'ready' : hasTax(s) ? 'waiting' : 'blocked',
      detail: hasAlc(s) ? `${s.allocations.partners.length} partners allocated` : 'Consumes TAX + MDM + ACC',
      feeds: ['DOC'],
      needs: ['MDM', 'ACC', 'TAX'],
    },
    {
      id: 'DOC',
      label: 'DOC',
      status: hasDoc(s) ? 'ready' : hasAlc(s) && hasTax(s) ? 'waiting' : 'blocked',
      detail: hasDoc(s) ? s.printPackage.packageId : 'Consumes TAX + ALC (+ CLM/MDM identity)',
      feeds: [],
      needs: ['CLM', 'MDM', 'TAX', 'ALC'],
    },
  ];

  const edges = [
    { from: 'CLM', to: 'MDM', active: hasClm(s) },
    { from: 'CLM', to: 'ACC', active: hasClm(s) },
    { from: 'CLM', to: 'TAX', active: hasClm(s) },
    { from: 'MDM', to: 'ACC', active: hasMdm(s) },
    { from: 'MDM', to: 'TAX', active: hasMdm(s) },
    { from: 'ACC', to: 'TAX', active: hasAcc(s) },
    { from: 'ACC', to: 'ALC', active: hasAcc(s) },
    { from: 'TAX', to: 'ALC', active: hasTax(s) },
    { from: 'TAX', to: 'DOC', active: hasTax(s) },
    { from: 'ALC', to: 'DOC', active: hasAlc(s) },
  ];

  return {
    nodes,
    edges,
    consumedBy: {
      ACC: {
        fromClm: hasClm(s) ? clmPayload(s) : null,
        fromMdm: hasMdm(s) ? mdmPayload(s) : null,
        ownUpload: hasAcc(s) ? accPayload(s) : null,
      },
      TAX: {
        fromClm: hasClm(s) ? clmPayload(s) : null,
        fromMdm: hasMdm(s) ? mdmPayload(s) : null,
        fromAcc: hasAcc(s) ? accPayload(s) : null,
        result: s.taxComputation || null,
      },
      ALC: {
        fromMdm: hasMdm(s) ? mdmPayload(s) : null,
        fromAcc: hasAcc(s) ? { capitalAccounts: s.partners?.map((p) => p.capitalAccount) } : null,
        fromTax: s.taxComputation || null,
        result: s.allocations || null,
      },
      DOC: {
        fromClm: hasClm(s) ? { engagementId: s.engagementId, taxYear: s.taxYear } : null,
        fromMdm: hasMdm(s) ? { entity: s.entity } : null,
        fromTax: s.taxComputation || null,
        fromAlc: s.allocations || null,
        result: s.printPackage || null,
      },
    },
  };
}

module.exports = {
  hasClm,
  hasMdm,
  hasAcc,
  hasTax,
  hasAlc,
  hasDoc,
  hasCem,
  hasMad,
  hasCam,
  hasTim,
  hasRpam,
  hasForms,
  clmPayload,
  mdmPayload,
  accPayload,
  cemPayload,
  madPayload,
  camPayload,
  buildDataFlow,
};
