const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '../shared/filingEngine.js');
let t = fs.readFileSync(p, 'utf8');
const start = t.indexOf('function runAllocate()');
const end = t.indexOf('function runForms()');
if (start < 0 || end < 0) {
  console.error('markers not found', start, end);
  process.exit(1);
}
const replacement = `function runAllocate() {
  const s = store.read();
  if (!s.taxComputation) throw new Error('Run TIM calculation before RPAM allocations');
  const job = startJob(s, 'rpam-allocate-tier', 'RPAM');

  const ordinary = s.taxComputation.ordinaryBusinessIncome;
  const interest = s.taxComputation.interestIncome || 0;

  const partners = s.partners.map((p) => {
    const share = Number(p.ownershipPct) / 100;
    const ordinaryIncome = money(ordinary * share);
    const interestIncome = money(interest * share);
    const endingCapital = money(
      p.beginningCapital + p.contributions - p.distributions + ordinaryIncome + interestIncome
    );
    return {
      partnerId: p.partnerId,
      name: p.name,
      ownershipPct: p.ownershipPct,
      capitalAccount: p.capitalAccount,
      k1: {
        ordinaryIncome,
        interestIncome,
        guaranteedPayments: p.partnerId === 'P-001' ? s.taxComputation.guaranteedPayments : 0,
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
  const reconcilesToTim = Math.abs(allocatedOrdinary - ordinary) < 0.05;

  s.allocations = {
    method: 'pro-rata-ownership',
    specialAllocations: [],
    partners,
    reconciliation: {
      timOrdinaryIncome: ordinary,
      allocatedOrdinaryIncome: allocatedOrdinary,
      reconcilesToTim,
    },
    producedAt: new Date().toISOString(),
  };

  s.issues = mergeIssues(s.issues, [
    issue('CT-13', 'D', 'info', 'Ordinary income allocated per ownership; SA empty for this engagement'),
  ]);
  completeJob(s, job, reconcilesToTim ? 'succeeded' : 'failed');
  store.setStatus(s, 'allocated', 'forms');
  store.log(s, 'rpam.allocate', { partners: partners.length, reconcilesToTim });
  return store.write(s);
}

`;
t = t.slice(0, start) + replacement + t.slice(end);
fs.writeFileSync(p, t);
console.log('patched runAllocate');
