const XLSX = require('xlsx');

function workbookFromBuffer(buffer) {
  return XLSX.read(buffer, { type: 'buffer', cellDates: true });
}

function sheetToRows(wb, preferredNames = []) {
  const names = wb.SheetNames || [];
  let sheetName = names[0];
  for (const want of preferredNames) {
    const hit = names.find((n) => n.toLowerCase() === want.toLowerCase());
    if (hit) {
      sheetName = hit;
      break;
    }
  }
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
}

function pick(row, keys, fallback = '') {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return row[key];
    }
  }
  return fallback;
}

function asBool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  return ['y', 'yes', 'true', '1', 'x'].includes(s);
}

function asNumber(v, fallback = 0) {
  if (v === '' || v == null) return fallback;
  const n = Number(String(v).replace(/[,$]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function asStates(v) {
  if (Array.isArray(v)) return v;
  return String(v || '')
    .split(/[|,;/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** CEM workbook: sheet Engagement */
function parseCem(buffer) {
  const wb = workbookFromBuffer(buffer);
  const rows = sheetToRows(wb, ['Engagement', 'CEM', 'Context']);
  if (!rows.length) throw new Error('CEM Excel has no rows. Expected sheet Engagement.');
  const row = rows[0];
  return {
    clientId: String(pick(row, ['clientId', 'ClientId', 'Client ID', 'client'], 'CLI-UNKNOWN')),
    engagementId: String(pick(row, ['engagementId', 'EngagementId', 'Engagement ID', 'engagement'], 'ENG-UNKNOWN')),
    projectId: String(pick(row, ['projectId', 'ProjectId', 'Project ID', 'project'], 'PRJ-UNKNOWN')),
    entityGroupId: String(pick(row, ['entityGroupId', 'EntityGroupId', 'Entity Group', 'entityGroup'], 'EG-UNKNOWN')),
    jobId: String(pick(row, ['jobId', 'JobId', 'Job ID', 'job'], 'JOB-UNKNOWN')),
    entityName: String(
      pick(row, ['entityName', 'EntityName', 'Entity Name', 'legalName', 'LegalName', 'Legal Name', 'clientName', 'Client Name'], '')
    ),
    taxYear: asNumber(pick(row, ['taxYear', 'TaxYear', 'Tax Year'], 2025), 2025),
    dueDate: String(pick(row, ['dueDate', 'DueDate', 'Due Date'], '2026-03-15')),
    formType: String(pick(row, ['formType', 'FormType', 'Form'], '1065')),
    jurisdiction: String(pick(row, ['jurisdiction', 'Jurisdiction'], 'US-FED')),
    states: asStates(pick(row, ['states', 'States', 'State'], 'NY|CA')),
  };
}

/** MAD workbook: sheets Entity + Partners */
function parseMad(buffer) {
  const wb = workbookFromBuffer(buffer);
  const entityRows = sheetToRows(wb, ['Entity', 'MAD_Entity', 'Entities']);
  if (!entityRows.length) throw new Error('MAD Excel missing Entity sheet/rows.');
  const e = entityRows[0];
  const entity = {
    entityId: String(pick(e, ['entityId', 'EntityId', 'Entity ID'], 'ENT-UNKNOWN')),
    legalName: String(pick(e, ['legalName', 'LegalName', 'Legal Name', 'name'], 'Unknown LP')),
    ein: String(pick(e, ['ein', 'EIN'], '00-0000000')),
    entityType: String(pick(e, ['entityType', 'EntityType', 'Type'], 'partnership')),
    address: {
      line1: String(pick(e, ['addressLine1', 'AddressLine1', 'Address', 'line1'], '')),
      city: String(pick(e, ['city', 'City'], '')),
      state: String(pick(e, ['state', 'State'], '')),
      zip: String(pick(e, ['zip', 'Zip', 'ZIP'], '')),
    },
    fiscalYearEnd: String(pick(e, ['fiscalYearEnd', 'FYE', 'Fiscal Year End'], '12-31')),
    dateBusinessStarted: String(pick(e, ['dateBusinessStarted', 'StartDate', 'Date Business Started'], '2018-01-01')),
    section754Election: asBool(pick(e, ['section754Election', 'Section754', '754'], true)),
    multiState: asBool(pick(e, ['multiState', 'MultiState', 'Multi State'], true)),
  };

  const partnerRows = sheetToRows(wb, ['Partners', 'MAD_Partners', 'Ownership']);
  if (!partnerRows.length) throw new Error('MAD Excel missing Partners sheet/rows.');
  const partners = partnerRows.map((p, idx) => ({
    partnerId: String(pick(p, ['partnerId', 'PartnerId', 'Partner ID'], `P-${String(idx + 1).padStart(3, '0')}`)),
    name: String(pick(p, ['name', 'Name', 'Partner Name'], `Partner ${idx + 1}`)),
    tin: String(pick(p, ['tin', 'TIN', 'SSN'], '***-**-0000')),
    type: String(pick(p, ['type', 'Type', 'Partner Type'], 'individual')),
    ownershipPct: asNumber(pick(p, ['ownershipPct', 'OwnershipPct', 'Ownership %', 'ownPct'], 0)),
    profitPct: asNumber(pick(p, ['profitPct', 'ProfitPct', 'Profit %'], pick(p, ['ownershipPct', 'Ownership %'], 0))),
    lossPct: asNumber(pick(p, ['lossPct', 'LossPct', 'Loss %'], pick(p, ['ownershipPct', 'Ownership %'], 0))),
    capitalAccount: String(pick(p, ['capitalAccount', 'CapitalAccount', 'Capital Account'], `CA-${String(idx + 1).padStart(3, '0')}`)),
    beginningCapital: asNumber(pick(p, ['beginningCapital', 'BeginningCapital', 'Beg Capital'], 0)),
    contributions: asNumber(pick(p, ['contributions', 'Contributions'], 0)),
    distributions: asNumber(pick(p, ['distributions', 'Distributions'], 0)),
  }));

  const ownershipSum = partners.reduce((sum, p) => sum + Number(p.ownershipPct || 0), 0);
  if (Math.abs(ownershipSum - 100) > 0.05) {
    throw new Error(`MAD Partners ownership must total 100% (got ${ownershipSum}%)`);
  }

  return { entity, partners };
}

/** CAM workbook: sheet TrialBalance */
function parseCam(buffer) {
  const wb = workbookFromBuffer(buffer);
  const rows = sheetToRows(wb, ['TrialBalance', 'CAM_TrialBalance', 'Accounts', 'COA']);
  if (!rows.length) throw new Error('CAM Excel missing TrialBalance sheet/rows.');
  const trialBalance = rows.map((r) => ({
    accountCode: String(pick(r, ['accountCode', 'AccountCode', 'Account', 'Code'], '')),
    accountName: String(pick(r, ['accountName', 'AccountName', 'Name', 'Description'], '')),
    bookAmount: asNumber(pick(r, ['bookAmount', 'BookAmount', 'Amount', 'Book'], 0)),
    taxAmount: null,
    schedule: String(pick(r, ['schedule', 'Schedule', 'Sch'], 'K')),
  })).filter((r) => r.accountCode);

  if (!trialBalance.length) throw new Error('CAM TrialBalance has no account rows.');
  return { trialBalance };
}

function writeSheet(wb, name, rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, name);
}

module.exports = {
  parseCem,
  parseMad,
  parseCam,
  writeSheet,
  XLSX,
};
