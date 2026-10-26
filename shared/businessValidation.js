/**
 * Business validation for TIM (tax engine) and RPAM (partner allocations).
 * Rules enforce Form 1065 partnership filing sanity before calc / allocate.
 */

function money(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function finding(code, severity, message, field = null, actual = null, expected = null) {
  return {
    code,
    severity, // error | warning | info
    message,
    field,
    actual,
    expected,
  };
}

function amountFor(trialBalance, code) {
  const row = (trialBalance || []).find((r) => String(r.accountCode) === String(code));
  return row ? Number(row.bookAmount) : null;
}

function hasCem(s) {
  return !!(s.projectId && s.jobId && s.engagementId);
}

function hasMad(s) {
  return !!(s.entity?.entityId && s.partners?.length);
}

function hasCam(s) {
  return !!(s.trialBalance?.length);
}

/**
 * TIM — prerequisites + book/tax business rules.
 */
function validateTim(s) {
  const findings = [];
  const tb = s.trialBalance || [];

  if (!hasCem(s)) {
    findings.push(
      finding('TIM-BV-01', 'error', 'CEM engagement context required (projectId / jobId / engagementId)', 'engagement')
    );
  }
  if (!hasMad(s)) {
    findings.push(finding('TIM-BV-02', 'error', 'MAD entity and partners required before tax calculation', 'entity'));
  }
  if (!hasCam(s)) {
    findings.push(finding('TIM-BV-03', 'error', 'CAM trial balance required before tax calculation', 'trialBalance'));
  }

  if (!s.taxYear || s.taxYear < 2000 || s.taxYear > 2100) {
    findings.push(
      finding('TIM-BV-04', 'error', 'Valid tax year required for Form 1065', 'taxYear', s.taxYear, '2000–2100')
    );
  }

  if (s.entity?.ein && !/^\d{2}-\d{7}$/.test(s.entity.ein)) {
    findings.push(finding('TIM-BV-05', 'error', 'Entity EIN must be NN-NNNNNNN for tax engine', 'entity.ein', s.entity.ein));
  }

  const ordinary = amountFor(tb, '4000');
  if (ordinary == null) {
    findings.push(
      finding('TIM-BV-10', 'error', 'Account 4000 (ordinary business income) is required on trial balance', '4000')
    );
  } else if (!Number.isFinite(ordinary)) {
    findings.push(finding('TIM-BV-11', 'error', 'Account 4000 must be numeric', '4000', ordinary));
  }

  const gp = amountFor(tb, '5000');
  if (gp == null) {
    findings.push(finding('TIM-BV-12', 'warning', 'Account 5000 (guaranteed payments) missing — treating as 0', '5000'));
  } else if (gp < 0) {
    findings.push(finding('TIM-BV-13', 'error', 'Guaranteed payments (5000) cannot be negative', '5000', gp));
  }

  const bookDep = amountFor(tb, '6100');
  if (bookDep == null) {
    findings.push(finding('TIM-BV-14', 'warning', 'Account 6100 (book depreciation) missing — M-1 dep adjustment will be 0', '6100'));
  } else if (bookDep > 0) {
    findings.push(
      finding(
        'TIM-BV-15',
        'warning',
        'Book depreciation (6100) is usually an expense (negative). Absolute value will be used.',
        '6100',
        bookDep
      )
    );
  }

  const meals = amountFor(tb, '6200');
  if (meals == null) {
    findings.push(finding('TIM-BV-16', 'warning', 'Account 6200 (meals) missing — 50% addback will be 0', '6200'));
  }

  const interest = amountFor(tb, '4100');
  if (interest != null && interest < 0) {
    findings.push(finding('TIM-BV-17', 'warning', 'Interest income (4100) is negative — verify classification', '4100', interest));
  }

  const fines = amountFor(tb, '6400');
  if (fines != null && Math.abs(fines) > 0) {
    findings.push(
      finding('TIM-BV-18', 'info', 'Nondeductible fines (6400) present — should not reduce taxable ordinary income', '6400', fines)
    );
  }

  if (s.entity && s.entity.section754Election == null) {
    findings.push(
      finding('TIM-BV-20', 'warning', 'Section 754 election status unknown — confirm before final return', 'section754Election')
    );
  }

  const states = s.states || [];
  if (s.entity?.multiState && states.length < 2) {
    findings.push(
      finding(
        'TIM-BV-21',
        'warning',
        'Entity flagged multi-state but fewer than 2 states on engagement',
        'states',
        states,
        '≥2 states'
      )
    );
  }
  if (!s.entity?.multiState && states.length > 1) {
    findings.push(
      finding('TIM-BV-22', 'warning', 'Multiple states on engagement but entity.multiState is false', 'multiState', false)
    );
  }

  // Duplicate account codes
  const codes = tb.map((r) => String(r.accountCode));
  const dupes = codes.filter((c, i) => codes.indexOf(c) !== i);
  if (dupes.length) {
    findings.push(
      finding('TIM-BV-23', 'error', `Duplicate trial balance account codes: ${[...new Set(dupes)].join(', ')}`, 'trialBalance')
    );
  }

  // If tax already computed, verify M-1 identity
  if (s.taxComputation) {
    const tc = s.taxComputation;
    const idOk = tc.identityChecks?.bookToTaxRollsToOrdinaryIncome;
    if (idOk === false) {
      findings.push(
        finding('TIM-BV-30', 'error', 'Schedule M-1 does not roll to ordinary business income (AQG3 identity)', 'identityChecks')
      );
    } else if (idOk === true) {
      findings.push(finding('TIM-BV-31', 'info', 'M-1 identity check passed — books + adjustments = ordinary income'));
    }
    if (tc.guaranteedPayments != null && ordinary != null && Math.abs(tc.guaranteedPayments) > Math.abs(ordinary) * 2) {
      findings.push(
        finding(
          'TIM-BV-32',
          'warning',
          'Guaranteed payments are unusually large vs ordinary income',
          'guaranteedPayments',
          tc.guaranteedPayments,
          `≤ 2× ordinary (${ordinary})`
        )
      );
    }
    const apport = tc.stateApportionment || {};
    const apportSum = Object.values(apport).reduce((a, b) => a + Number(b || 0), 0);
    if (Object.keys(apport).length && Math.abs(apportSum - 1) > 0.02) {
      findings.push(
        finding('TIM-BV-33', 'error', 'State apportionment factors must sum to 1.00', 'stateApportionment', apportSum, 1)
      );
    }
  }

  return summarize('TIM', findings);
}

/**
 * RPAM — ownership, capital, and allocation reconciliation rules.
 */
function validateRpam(s) {
  const findings = [];
  const partners = s.partners || [];

  if (!hasMad(s)) {
    findings.push(finding('RPAM-BV-01', 'error', 'MAD partners required before allocations', 'partners'));
  }
  if (!s.taxComputation) {
    findings.push(finding('RPAM-BV-02', 'error', 'TIM tax computation required before RPAM allocate', 'taxComputation'));
  }
  if (!hasCam(s)) {
    findings.push(finding('RPAM-BV-03', 'warning', 'CAM capital / books not loaded — capital rollforward uses MAD balances only', 'trialBalance'));
  }

  if (partners.length < 2) {
    findings.push(
      finding('RPAM-BV-10', 'error', 'Partnership Form 1065 requires at least two partners', 'partners.length', partners.length, '≥2')
    );
  }

  const ids = partners.map((p) => p.partnerId);
  if (new Set(ids).size !== ids.length) {
    findings.push(finding('RPAM-BV-11', 'error', 'Partner IDs must be unique', 'partnerId'));
  }

  const caps = partners.map((p) => p.capitalAccount).filter(Boolean);
  if (caps.length && new Set(caps).size !== caps.length) {
    findings.push(finding('RPAM-BV-12', 'error', 'Capital account IDs must be unique', 'capitalAccount'));
  }

  let ownSum = 0;
  let profitSum = 0;
  let lossSum = 0;

  partners.forEach((p, idx) => {
    const own = Number(p.ownershipPct);
    const profit = Number(p.profitPct ?? p.ownershipPct);
    const loss = Number(p.lossPct ?? p.ownershipPct);
    ownSum += own;
    profitSum += profit;
    lossSum += loss;

    if (!p.name) {
      findings.push(finding('RPAM-BV-13', 'error', `Partner[${idx}] missing name`, `partners[${idx}].name`));
    }
    if (!p.tin) {
      findings.push(finding('RPAM-BV-14', 'warning', `Partner ${p.partnerId || idx} missing TIN`, `partners[${idx}].tin`));
    }
    if (!Number.isFinite(own) || own <= 0) {
      findings.push(
        finding('RPAM-BV-15', 'error', `Partner ${p.partnerId || idx} ownership must be > 0`, 'ownershipPct', own)
      );
    }
    if (own > 100) {
      findings.push(finding('RPAM-BV-16', 'error', `Partner ${p.partnerId} ownership cannot exceed 100%`, 'ownershipPct', own));
    }
    if (Number(p.beginningCapital) < 0) {
      findings.push(
        finding(
          'RPAM-BV-17',
          'warning',
          `Partner ${p.partnerId} has negative beginning capital`,
          'beginningCapital',
          p.beginningCapital
        )
      );
    }
    if (Number(p.distributions) < 0) {
      findings.push(
        finding('RPAM-BV-18', 'error', `Partner ${p.partnerId} distributions cannot be negative`, 'distributions', p.distributions)
      );
    }
    if (Number(p.contributions) < 0) {
      findings.push(
        finding('RPAM-BV-19', 'error', `Partner ${p.partnerId} contributions cannot be negative`, 'contributions', p.contributions)
      );
    }
  });

  if (partners.length && Math.abs(ownSum - 100) > 0.05) {
    findings.push(
      finding('RPAM-BV-20', 'error', `Ownership percentages must total 100% (got ${money(ownSum)}%)`, 'ownershipPct', ownSum, 100)
    );
  }
  if (partners.length && Math.abs(profitSum - 100) > 0.05) {
    findings.push(
      finding('RPAM-BV-21', 'error', `Profit percentages must total 100% (got ${money(profitSum)}%)`, 'profitPct', profitSum, 100)
    );
  }
  if (partners.length && Math.abs(lossSum - 100) > 0.05) {
    findings.push(
      finding('RPAM-BV-22', 'error', `Loss percentages must total 100% (got ${money(lossSum)}%)`, 'lossPct', lossSum, 100)
    );
  }

  // Allocation results
  if (s.allocations) {
    const recon = s.allocations.reconciliation || {};
    if (recon.reconcilesToTim === false) {
      findings.push(
        finding(
          'RPAM-BV-30',
          'error',
          `Allocated ordinary (${recon.allocatedOrdinaryIncome}) does not reconcile to TIM (${recon.timOrdinaryIncome})`,
          'reconciliation',
          recon.allocatedOrdinaryIncome,
          recon.timOrdinaryIncome
        )
      );
    } else if (recon.reconcilesToTim === true) {
      findings.push(finding('RPAM-BV-31', 'info', 'Partner ordinary income reconciles to TIM taxable ordinary'));
    }

    const gpTim = Number(s.taxComputation?.guaranteedPayments || 0);
    const gpAlloc = money((s.allocations.partners || []).reduce((sum, p) => sum + Number(p.k1?.guaranteedPayments || 0), 0));
    if (Math.abs(gpAlloc - gpTim) > 0.05) {
      findings.push(
        finding(
          'RPAM-BV-32',
          'error',
          'Allocated guaranteed payments must equal TIM Schedule K GP',
          'guaranteedPayments',
          gpAlloc,
          gpTim
        )
      );
    }

    for (const p of s.allocations.partners || []) {
      const k = p.k1 || {};
      const expectedEnding = money(
        Number(k.beginningCapital || 0) +
          Number(k.contributions || 0) -
          Number(k.distributions || 0) +
          Number(k.ordinaryIncome || 0) +
          Number(k.interestIncome || 0) +
          Number(k.guaranteedPayments || 0)
      );
      // Note: GP often increases capital; our engine may or may not include GP in ending — check consistency with stored ending
      const stored = money(k.endingCapital);
      const withoutGp = money(
        Number(k.beginningCapital || 0) +
          Number(k.contributions || 0) -
          Number(k.distributions || 0) +
          Number(k.ordinaryIncome || 0) +
          Number(k.interestIncome || 0)
      );
      if (Math.abs(stored - withoutGp) > 0.05 && Math.abs(stored - expectedEnding) > 0.05) {
        findings.push(
          finding(
            'RPAM-BV-33',
            'error',
            `Capital rollforward broken for ${p.partnerId}: ending ${stored} ≠ beg+contrib−dist+income`,
            'endingCapital',
            stored,
            withoutGp
          )
        );
      }

      const headroom =
        Number(k.beginningCapital || 0) + Number(k.contributions || 0) + Number(k.ordinaryIncome || 0) + Number(k.interestIncome || 0);
      if (Number(k.distributions || 0) > headroom + 0.01 && Number(k.endingCapital) < 0) {
        findings.push(
          finding(
            'RPAM-BV-34',
            'warning',
            `Partner ${p.partnerId} distributions exceed available capital (ending capital negative)`,
            'distributions',
            k.distributions
          )
        );
      }
    }

    if (s.allocations.method === 'pro-rata-ownership') {
      for (const p of s.allocations.partners || []) {
        const mad = partners.find((m) => m.partnerId === p.partnerId);
        if (!mad) continue;
        const expectedShare = Number(mad.ownershipPct) / 100;
        const ordinary = Number(s.taxComputation.ordinaryBusinessIncome || 0);
        const expectedOrd = money(ordinary * expectedShare);
        if (Math.abs(Number(p.k1.ordinaryIncome) - expectedOrd) > 0.05) {
          findings.push(
            finding(
              'RPAM-BV-35',
              'error',
              `Pro-rata allocation mismatch for ${p.partnerId}`,
              'ordinaryIncome',
              p.k1.ordinaryIncome,
              expectedOrd
            )
          );
        }
      }
    }
  }

  return summarize('RPAM', findings);
}

function summarize(module, findings) {
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const infos = findings.filter((f) => f.severity === 'info').length;
  return {
    module,
    ok: errors === 0,
    canProceed: errors === 0,
    summary: { errors, warnings, infos, total: findings.length },
    findings,
    validatedAt: new Date().toISOString(),
  };
}

module.exports = {
  validateTim,
  validateRpam,
  money,
  amountFor,
  finding,
};
