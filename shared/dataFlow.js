/**
 * Upload-driven taxation data flow (no contract-testing UI).
 *
 * CEM + MAD uploads  → consumed by CAM and TIM
 * CAM upload         → joins CEM + MAD + CAM books → feeds TIM and RPAM
 * TIM + RPAM calc    → feeds Forms Print
 */

/** Upload-driven readiness — seeded demo rows alone do not light up the flow. */
function hasCem(s) {
  return !!(s.imports?.cem || s.correlationId);
}

function hasMad(s) {
  return !!(s.imports?.mad);
}

function hasCam(s) {
  return !!(s.imports?.cam);
}

function hasTim(s) {
  return !!s.taxComputation;
}

function hasRpam(s) {
  return !!s.allocations;
}

function hasForms(s) {
  return !!s.printPackage;
}

function cemPayload(s) {
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

function madPayload(s) {
  return {
    entity: s.entity,
    partners: s.partners,
  };
}

function camPayload(s) {
  return {
    trialBalance: s.trialBalance,
    accountMaps: s.accountMaps,
  };
}

function buildDataFlow(s) {
  const nodes = [
    {
      id: 'CEM',
      label: 'CEM',
      status: hasCem(s) ? 'ready' : 'empty',
      detail: hasCem(s)
        ? s.entityName || s.entity?.legalName || s.engagementId
        : 'Upload CEM Excel',
      feeds: ['MAD', 'CAM', 'TIM'],
    },
    {
      id: 'MAD',
      label: 'MAD',
      status: hasMad(s) ? 'ready' : 'empty',
      detail: hasMad(s)
        ? `${s.partners?.length || 0} partners · ${s.entity?.ein || 'EIN pending'}`
        : 'Upload MAD Excel (needs CEM)',
      feeds: ['CAM', 'TIM'],
      needs: ['CEM'],
    },
    {
      id: 'CAM',
      label: 'CAM',
      status: hasCam(s) ? 'ready' : 'empty',
      detail: hasCam(s) ? `${s.trialBalance.length} accounts` : 'Upload CAM Excel (needs CEM+MAD)',
      feeds: ['TIM', 'RPAM'],
      needs: ['CEM', 'MAD'],
    },
    {
      id: 'TIM',
      label: 'TIM',
      status: hasTim(s) ? 'ready' : hasCam(s) && hasMad(s) && hasCem(s) ? 'waiting' : 'blocked',
      detail: hasTim(s)
        ? `Ordinary ${s.taxComputation.ordinaryBusinessIncome}`
        : 'Consumes CEM + MAD + CAM',
      feeds: ['RPAM', 'FORMS'],
      needs: ['CEM', 'MAD', 'CAM'],
    },
    {
      id: 'RPAM',
      label: 'RPAM',
      status: hasRpam(s) ? 'ready' : hasTim(s) ? 'waiting' : 'blocked',
      detail: hasRpam(s) ? `${s.allocations.partners.length} partners allocated` : 'Consumes TIM + MAD + CAM',
      feeds: ['FORMS'],
      needs: ['MAD', 'CAM', 'TIM'],
    },
    {
      id: 'FORMS',
      label: 'Forms Print',
      status: hasForms(s) ? 'ready' : hasRpam(s) && hasTim(s) ? 'waiting' : 'blocked',
      detail: hasForms(s) ? s.printPackage.packageId : 'Consumes TIM + RPAM (+ CEM/MAD identity)',
      feeds: [],
      needs: ['CEM', 'MAD', 'TIM', 'RPAM'],
    },
  ];

  const edges = [
    { from: 'CEM', to: 'MAD', active: hasCem(s) },
    { from: 'CEM', to: 'CAM', active: hasCem(s) },
    { from: 'CEM', to: 'TIM', active: hasCem(s) },
    { from: 'MAD', to: 'CAM', active: hasMad(s) },
    { from: 'MAD', to: 'TIM', active: hasMad(s) },
    { from: 'CAM', to: 'TIM', active: hasCam(s) },
    { from: 'CAM', to: 'RPAM', active: hasCam(s) },
    { from: 'TIM', to: 'RPAM', active: hasTim(s) },
    { from: 'TIM', to: 'FORMS', active: hasTim(s) },
    { from: 'RPAM', to: 'FORMS', active: hasRpam(s) },
  ];

  return {
    nodes,
    edges,
    consumedBy: {
      CAM: {
        fromCem: hasCem(s) ? cemPayload(s) : null,
        fromMad: hasMad(s) ? madPayload(s) : null,
        ownUpload: hasCam(s) ? camPayload(s) : null,
      },
      TIM: {
        fromCem: hasCem(s) ? cemPayload(s) : null,
        fromMad: hasMad(s) ? madPayload(s) : null,
        fromCam: hasCam(s) ? camPayload(s) : null,
        result: s.taxComputation || null,
      },
      RPAM: {
        fromMad: hasMad(s) ? madPayload(s) : null,
        fromCam: hasCam(s) ? { capitalAccounts: s.partners?.map((p) => p.capitalAccount) } : null,
        fromTim: s.taxComputation || null,
        result: s.allocations || null,
      },
      FORMS: {
        fromCem: hasCem(s) ? { engagementId: s.engagementId, taxYear: s.taxYear } : null,
        fromMad: hasMad(s) ? { entity: s.entity } : null,
        fromTim: s.taxComputation || null,
        fromRpam: s.allocations || null,
        result: s.printPackage || null,
      },
    },
  };
}

module.exports = {
  hasCem,
  hasMad,
  hasCam,
  hasTim,
  hasRpam,
  hasForms,
  cemPayload,
  madPayload,
  camPayload,
  buildDataFlow,
};
