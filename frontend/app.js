const state = {
  health: null,
  filing: null,
  datasets: null,
  module: 'CEM',
};

const MODULES = {
  CEM: {
    title: 'CEM — Client Engagement',
    eyebrow: 'Module',
    hint: 'Creates engagement, project, entity group and job. Feeds MAD, CAM and TIM.',
    port: 4101,
    upload: 'cem',
  },
  MAD: {
    title: 'MAD — Master Data',
    eyebrow: 'Module',
    hint: 'Legal entity, partners and ownership. Needs CEM. Feeds CAM and TIM.',
    port: 4102,
    upload: 'mad',
  },
  CAM: {
    title: 'CAM — Accounting',
    eyebrow: 'Module',
    hint: 'Trial balance / chart of accounts. Needs CEM + MAD. Feeds TIM and RPAM.',
    port: 4103,
    upload: 'cam',
  },
  TIM: {
    title: 'TIM — Tax Engine',
    eyebrow: 'Module',
    hint: 'Business-validated federal / state calculation. Consumes CEM + MAD + CAM. Feeds RPAM and Forms Print.',
    port: 4104,
  },
  RPAM: {
    title: 'RPAM — Allocations',
    eyebrow: 'Module',
    hint: 'Business-validated partner capital and K-1 amounts. Consumes MAD + CAM + TIM. Feeds Forms Print.',
    port: 4105,
  },
  FORMS: {
    title: 'Forms Print',
    eyebrow: 'Module',
    hint: 'Form 1065 / K-1 / K-3 package. Consumes CEM + MAD + TIM + RPAM.',
    port: 4106,
  },
};

const VIEW_META = {
  flow: { eyebrow: 'Upload → consume → calculate → print', title: 'Taxation data flow' },
  forms: { eyebrow: 'Outputs', title: 'Form 1065 · Schedule K-1 · Package' },
  docs: { eyebrow: 'Resources', title: 'API docs' },
  module: { eyebrow: 'Module', title: 'Module' },
};

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function showView(name, moduleId) {
  if (name === 'module' && moduleId) state.module = moduleId;

  document.querySelectorAll('.view').forEach((el) => el.classList.toggle('active', el.id === `view-${name}`));
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    const isModule = btn.dataset.view === 'module';
    const active = isModule
      ? name === 'module' && btn.dataset.module === state.module
      : btn.dataset.view === name;
    btn.classList.toggle('active', active);
  });

  if (name === 'module') {
    const m = MODULES[state.module];
    document.getElementById('viewEyebrow').textContent = m.eyebrow;
    document.getElementById('viewTitle').textContent = m.title;
    renderModule(state.module);
    return;
  }

  const meta = VIEW_META[name] || VIEW_META.flow;
  document.getElementById('viewEyebrow').textContent = meta.eyebrow;
  document.getElementById('viewTitle').textContent = meta.title;
  if (name === 'forms') renderForms();
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: {
      Accept: 'application/json',
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    },
    ...options,
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    const err = new Error(body?.error || `HTTP ${res.status}`);
    err.body = body;
    throw err;
  }
  return body;
}

async function loadFiling() {
  state.filing = await api('/api/filing');
  renderFlow();
  renderForms();
  if (document.getElementById('view-module').classList.contains('active')) {
    renderModule(state.module);
  }
}

function renderFlow() {
  const f = state.filing;
  if (!f) return;
  document.getElementById('statusPill').textContent = f.filingStatus || 'draft';

  document.getElementById('engBanner').innerHTML = [
    ['Engagement', f.engagementId, true],
    ['Project', f.projectId, true],
    ['Entity', f.entityName || f.entity?.legalName],
    ['EIN', f.entity?.ein, true],
    ['Tax year', f.taxYear],
    ['Package', f.printPackage?.packageId, true],
  ]
    .map(([label, value, mono]) => {
      const display = value == null || value === '' ? '—' : value;
      return `<div><span class="label">${label}</span><span class="value ${mono ? 'mono' : ''}">${display}</span></div>`;
    })
    .join('');

  const df = f.dataFlow || { nodes: [], edges: [] };
  document.getElementById('flowNodes').innerHTML = df.nodes
    .map(
      (n) => `<button type="button" class="flow-node ${n.status}" data-goto-module="${n.id === 'Forms Print' ? 'FORMS' : n.id}">
      <div class="id">${n.label}</div>
      <div class="detail">${n.detail}</div>
      <div class="meta">${n.status}${n.feeds?.length ? ` → ${n.feeds.join(', ')}` : ''}</div>
    </button>`
    )
    .join('');

  document.querySelectorAll('[data-goto-module]').forEach((btn) => {
    btn.addEventListener('click', () => showView('module', btn.dataset.gotoModule));
  });

  document.getElementById('flowEdges').innerHTML = df.edges
    .map((e) => `<span class="flow-edge ${e.active ? 'on' : 'off'}">${e.from} → ${e.to}</span>`)
    .join('');
}

function renderModule(id) {
  const f = state.filing || {};
  const meta = MODULES[id];
  const node = (f.dataFlow?.nodes || []).find((n) => n.id === id || (id === 'FORMS' && n.id === 'Forms Print'));
  const svcHealth = (state.health?.services || []).find((s) => s.id === id);

  document.getElementById('moduleHeading').textContent = meta.title;
  document.getElementById('moduleHint').textContent = meta.hint;

  document.getElementById('moduleBanner').innerHTML = [
    ['Status', node?.status || 'empty'],
    ['Port', meta.port, true],
    ['Health', svcHealth?.healthy ? 'up' : 'down'],
    ['Detail', node?.detail || '—'],
  ]
    .map(
      ([label, value, mono]) =>
        `<div><span class="label">${label}</span><span class="value ${mono ? 'mono' : ''}">${value ?? '—'}</span></div>`
    )
    .join('');

  const uploadBox = document.getElementById('moduleUpload');
  if (meta.upload) {
    uploadBox.classList.remove('hidden');
    uploadBox.innerHTML = `
      <h3>Excel upload</h3>
      <input type="file" id="moduleFile" accept=".xlsx" />
      <button type="button" class="btn small" id="moduleUploadBtn">Upload ${id}</button>
      <pre id="moduleUploadOut" class="code">Choose a .xlsx file for ${id}.</pre>`;
    document.getElementById('moduleUploadBtn').addEventListener('click', () => {
      uploadFromModulePage(meta.upload).catch((err) => alert(err.message));
    });
  } else {
    uploadBox.classList.add('hidden');
    uploadBox.innerHTML = '';
  }

  const body = document.getElementById('moduleBody');
  if (id === 'CEM') {
    body.innerHTML = `<dl class="kv">
      <dt>Client</dt><dd>${f.clientId || '—'}</dd>
      <dt>Engagement</dt><dd>${f.engagementId || '—'}</dd>
      <dt>Project</dt><dd>${f.projectId || '—'}</dd>
      <dt>Entity group</dt><dd>${f.entityGroupId || '—'}</dd>
      <dt>Job</dt><dd>${f.jobId || '—'}</dd>
      <dt>Correlation</dt><dd>${f.correlationId || '—'}</dd>
      <dt>States</dt><dd>${(f.states || []).join(', ') || '—'}</dd>
    </dl>`;
  } else if (id === 'MAD') {
    body.innerHTML = `<dl class="kv">
      <dt>Entity</dt><dd>${f.entity?.legalName || '—'}</dd>
      <dt>EIN</dt><dd>${f.entity?.ein || '—'}</dd>
      <dt>§754</dt><dd>${f.entity?.section754Election ? 'Yes' : 'No'}</dd>
    </dl>
    <h3>Partners</h3>
    <table class="partners"><thead><tr><th>Partner</th><th>Own%</th><th>Beg capital</th></tr></thead><tbody>
    ${(f.partners || [])
      .map((p) => `<tr><td>${p.name}</td><td>${p.ownershipPct}%</td><td class="num">${money(p.beginningCapital)}</td></tr>`)
      .join('') || '<tr><td colspan="3">No partners loaded</td></tr>'}
    </tbody></table>`;
  } else if (id === 'CAM') {
    body.innerHTML = `<table class="partners"><thead><tr><th>Acct</th><th>Name</th><th>Book</th><th>Sch</th></tr></thead><tbody>
    ${(f.trialBalance || [])
      .map(
        (r) =>
          `<tr><td>${r.accountCode}</td><td>${r.accountName}</td><td class="num">${money(r.bookAmount)}</td><td>${r.schedule}</td></tr>`
      )
      .join('') || '<tr><td colspan="4">Upload CAM Excel after CEM + MAD</td></tr>'}
    </tbody></table>`;
  } else if (id === 'TIM') {
    const v = f.validations?.tim;
    const states = Object.entries(f.taxComputation?.stateTaxableIncome || {})
      .map(([st, amt]) => `${st} ${money(amt)}`)
      .join(' · ');
    body.innerHTML = `
      <div class="module-actions">
        <button type="button" class="btn small" id="timValidateBtn">Run TIM validation</button>
        <button type="button" class="btn small primary" id="timCalcBtn">Calculate tax</button>
      </div>
      ${renderValidationPanel(v, 'TIM')}
      ${
        !f.taxComputation
          ? '<p class="muted">Waiting for CEM + MAD + CAM. Upload CAM (or click Calculate) after validation passes.</p>'
          : `<dl class="kv">
        <dt>Ordinary income</dt><dd>${money(f.taxComputation.ordinaryBusinessIncome)}</dd>
        <dt>Federal taxable</dt><dd>${money(f.taxComputation.federalTaxableIncome)}</dd>
        <dt>Interest</dt><dd>${money(f.taxComputation.interestIncome)}</dd>
        <dt>Guaranteed payments</dt><dd>${money(f.taxComputation.guaranteedPayments)}</dd>
        <dt>State taxable</dt><dd>${states || '—'}</dd>
        <dt>M-1 identity</dt><dd>${f.taxComputation.identityChecks?.bookToTaxRollsToOrdinaryIncome ? 'PASS' : 'FAIL'}</dd>
      </dl>
      <h3>Schedule M-1</h3>
      <table class="partners"><thead><tr><th>Code</th><th>Description</th><th>Amount</th></tr></thead><tbody>
      ${(f.bookToTax || [])
        .map((r) => `<tr><td>${r.code}</td><td>${r.description}</td><td class="num">${money(r.amount)}</td></tr>`)
        .join('')}
      </tbody></table>`
      }`;
    document.getElementById('timValidateBtn')?.addEventListener('click', () => {
      runModuleAction('tim-validate').catch((err) => alert(err.message));
    });
    document.getElementById('timCalcBtn')?.addEventListener('click', () => {
      runModuleAction('tim-calculate').catch((err) => alert(err.message));
    });
  } else if (id === 'RPAM') {
    const v = f.validations?.rpam;
    const recon = f.allocations?.reconciliation;
    body.innerHTML = `
      <div class="module-actions">
        <button type="button" class="btn small" id="rpamValidateBtn">Run RPAM validation</button>
        <button type="button" class="btn small primary" id="rpamAllocBtn">Allocate partners</button>
      </div>
      ${renderValidationPanel(v, 'RPAM')}
      ${
        !f.allocations
          ? '<p class="muted">Waiting for TIM calculation (and passing RPAM ownership rules).</p>'
          : `<p class="hint">Reconciles to TIM: ${recon?.reconcilesToTim ? 'PASS' : 'FAIL'} · GP: ${
              recon?.gpReconciles ? 'PASS' : 'FAIL'
            } · GP partner: ${recon?.gpPartnerId || '—'}</p>
      <table class="partners"><thead><tr><th>Partner</th><th>Own%</th><th>Ordinary</th><th>GP</th><th>Ending capital</th></tr></thead><tbody>
      ${f.allocations.partners
        .map(
          (p) =>
            `<tr><td>${p.name}</td><td>${p.ownershipPct}%</td><td class="num">${money(p.k1.ordinaryIncome)}</td><td class="num">${money(
              p.k1.guaranteedPayments
            )}</td><td class="num">${money(p.k1.endingCapital)}</td></tr>`
        )
        .join('')}
      </tbody></table>`
      }`;
    document.getElementById('rpamValidateBtn')?.addEventListener('click', () => {
      runModuleAction('rpam-validate').catch((err) => alert(err.message));
    });
    document.getElementById('rpamAllocBtn')?.addEventListener('click', () => {
      runModuleAction('rpam-allocate').catch((err) => alert(err.message));
    });
  } else if (id === 'FORMS') {
    body.innerHTML = `<dl class="kv">
      <dt>Package</dt><dd>${f.printPackage?.packageId || '—'}</dd>
      <dt>Status</dt><dd>${f.printPackage?.status || '—'}</dd>
      <dt>ERE sync</dt><dd>${f.printPackage?.ereSync?.status || '—'}</dd>
      <dt>MeF</dt><dd>${f.efile?.status || 'not submitted'}</dd>
      <dt>Submission</dt><dd>${f.efile?.submissionId || '—'}</dd>
    </dl>
    <ul>${(f.printPackage?.documents || [])
      .map((d) => `<li><strong>${d.code}</strong> — ${d.name}</li>`)
      .join('')}</ul>`;
  }

  const consumedKey = id === 'FORMS' ? 'FORMS' : id;
  const consumed = f.dataFlow?.consumedBy?.[consumedKey] || f.published?.[id.toLowerCase()] || null;
  document.getElementById('moduleSide').textContent = JSON.stringify(
    {
      health: svcHealth
        ? { id: svcHealth.id, port: svcHealth.port, healthy: svcHealth.healthy }
        : null,
      flowNode: node || null,
      validation: id === 'TIM' ? f.validations?.tim : id === 'RPAM' ? f.validations?.rpam : null,
      consumed: consumed,
      import: f.imports?.[id.toLowerCase()] || null,
    },
    null,
    2
  );
}

function renderValidationPanel(v, label) {
  if (!v) {
    return `<div class="validation-panel pending"><strong>${label} validation</strong><p class="muted">Not run yet — click Run validation or upload CAM to calculate.</p></div>`;
  }
  const tone = v.ok ? 'ok' : 'fail';
  const rows = (v.findings || [])
    .map(
      (f) =>
        `<li class="sev-${f.severity}"><span class="sev">${f.severity}</span> <code>${f.code}</code> ${escapeHtml(f.message)}</li>`
    )
    .join('');
  return `<div class="validation-panel ${tone}">
    <strong>${label} validation — ${v.ok ? 'PASS' : 'FAIL'}</strong>
    <p class="hint">${v.summary?.errors || 0} errors · ${v.summary?.warnings || 0} warnings · ${v.summary?.infos || 0} info</p>
    <ul class="validation-list">${rows || '<li class="muted">No findings</li>'}</ul>
  </div>`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function notifyBrief(title, detail) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(typeof detail === 'string' ? detail : JSON.stringify(detail))}</span>`;
  el.classList.add('show');
  clearTimeout(notifyBrief._t);
  notifyBrief._t = setTimeout(() => el.classList.remove('show'), 3200);
}

async function runModuleAction(action) {
  let path;
  let method = 'GET';
  if (action === 'tim-validate') path = '/api/filing/validate/tim';
  else if (action === 'rpam-validate') path = '/api/filing/validate/rpam';
  else if (action === 'tim-calculate') {
    path = '/api/filing/tim/calculate';
    method = 'POST';
  } else if (action === 'rpam-allocate') {
    path = '/api/filing/rpam/allocate';
    method = 'POST';
  } else throw new Error(`Unknown action ${action}`);

  let body;
  try {
    body = await api(path, method === 'POST' ? { method: 'POST', body: '{}' } : {});
  } catch (err) {
    body = err.body || { error: err.message, ok: false };
  }

  if (body.snapshot) state.filing = body.snapshot;
  else await loadFiling();

  renderModule(state.module);
  const validation = body.validation || (body.findings ? body : null);
  const ok = validation ? validation.ok !== false && (validation.summary?.errors || 0) === 0 : body.ok !== false;
  notifyBrief(
    `${action}: ${ok ? 'PASS' : 'FAIL'}`,
    validation?.summary
      ? `${validation.summary.errors} err / ${validation.summary.warnings} warn`
      : body.error || 'done'
  );
}

async function uploadFromModulePage(module) {
  const input = document.getElementById('moduleFile');
  const out = document.getElementById('moduleUploadOut');
  if (!input?.files?.length) throw new Error(`Choose a .xlsx for ${module.toUpperCase()}`);
  const form = new FormData();
  form.append('file', input.files[0]);
  out.textContent = `Uploading ${module.toUpperCase()}…`;
  const body = await api(`/api/filing/upload/${module}`, { method: 'POST', body: form });
  state.filing = body.snapshot;
  renderFlow();
  renderForms();
  renderModule(state.module);
  out.textContent = JSON.stringify(
    {
      module: body.module,
      routedTo: body.routedTo,
      fileName: body.fileName,
      packageId: state.filing.printPackage?.packageId,
    },
    null,
    2
  );
}

function renderForms() {
  const f = state.filing;
  if (!f) return;
  const formEl = document.getElementById('form1065Body');
  const k1El = document.getElementById('k1Body');
  const pkgEl = document.getElementById('packageBody');

  if (!f.taxComputation && !f.form1065) {
    formEl.innerHTML = '<p class="muted">Upload CEM → MAD → CAM to generate Form 1065 lines.</p>';
  } else {
    const ordinary = f.form1065?.lines?.ordinaryBusinessIncome ?? f.taxComputation?.ordinaryBusinessIncome;
    formEl.innerHTML = `<dl class="kv">
      <dt>Taxpayer</dt><dd>${f.entity?.legalName} (${f.entity?.ein})</dd>
      <dt>Line 22 ordinary</dt><dd>${money(ordinary)}</dd>
      <dt>Interest</dt><dd>${money(f.taxComputation?.interestIncome)}</dd>
      <dt>Guaranteed pmts</dt><dd>${money(f.taxComputation?.guaranteedPayments)}</dd>
      <dt>NY / CA</dt><dd>${money(f.taxComputation?.stateTaxableIncome?.NY)} / ${money(f.taxComputation?.stateTaxableIncome?.CA)}</dd>
    </dl>`;
  }

  if (!f.k1s?.length) {
    k1El.innerHTML = '<p class="muted">No K-1s yet.</p>';
  } else {
    k1El.innerHTML = f.k1s
      .map(
        (k) => `<div class="k1-card">
        <h4>${k.partnerName}</h4>
        <dl class="kv">
          <dt>Box 1</dt><dd>${money(k.partIII.box1_ordinaryIncome)}</dd>
          <dt>Box 5</dt><dd>${money(k.partIII.box5_interest)}</dd>
          <dt>Ending capital</dt><dd>${money(k.partII_capital.ending)}</dd>
        </dl>
      </div>`
      )
      .join('');
  }

  pkgEl.textContent = JSON.stringify({ printPackage: f.printPackage, efile: f.efile }, null, 2);
}

async function refreshHealth() {
  const pill = document.getElementById('healthPill');
  try {
    state.health = await api('/api/health');
    const up = state.health.services.filter((s) => s.healthy).length;
    pill.textContent = `${up}/${state.health.services.length} services`;
    pill.className = 'pill ' + (up === state.health.services.length ? 'ok' : 'bad');
    if (document.getElementById('view-module').classList.contains('active')) {
      renderModule(state.module);
    }
  } catch {
    pill.textContent = 'gateway down';
    pill.className = 'pill bad';
  }
}

async function loadDatasets() {
  state.datasets = await api('/api/filing/datasets');
  document.getElementById('datasetSelect').innerHTML = (state.datasets.datasets || [])
    .map((d) => `<option value="${d.id}">${d.id} — ${d.label}</option>`)
    .join('');
  updateDatasetLinks();
}

function updateDatasetLinks() {
  const id = document.getElementById('datasetSelect').value;
  const ds = (state.datasets?.datasets || []).find((d) => d.id === id);
  if (!ds) return;
  document.getElementById('dlCem').href = ds.files.cem;
  document.getElementById('dlMad').href = ds.files.mad;
  document.getElementById('dlCam').href = ds.files.cam;
  const zip = ds.downloadZip || `/download/testdata/${id}.zip`;
  const zipLink = document.getElementById('dlSetZip');
  if (zipLink) {
    zipLink.href = zip;
    zipLink.download = `taxmesh-${id}.zip`;
  }
  const set = (el, text) => {
    if (el) el.textContent = text;
  };
  set(document.getElementById('urlCem'), ds.files.cem);
  set(document.getElementById('urlMad'), ds.files.mad);
  set(document.getElementById('urlCam'), ds.files.cam);
  set(document.getElementById('urlSetZip'), zip);

  const list = document.getElementById('testdataUrlList');
  if (list && state.datasets?.datasets?.length) {
    const all = state.datasets.downloadAll || '/download/testdata.zip';
    list.innerHTML = [
      `<li><a href="${all}" download="taxmesh-testdata.zip"><code>${all}</code></a> — all sets</li>`,
      ...(state.datasets.datasets || []).map(
        (d) =>
          `<li><strong>${d.id}</strong> — ${d.label}<br/>
            <a href="${d.files.cem}" download>cem.xlsx</a> ·
            <a href="${d.files.mad}" download>mad.xlsx</a> ·
            <a href="${d.files.cam}" download>cam.xlsx</a> ·
            <a href="${d.downloadZip || `/download/testdata/${d.id}.zip`}" download>ZIP</a>
            <div class="muted mono small-url">${d.downloadZip || `/download/testdata/${d.id}.zip`}</div>
          </li>`
      ),
    ].join('');
  }
}

async function toFile(url, name) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new File([blob], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

async function loadDatasetFilesIntoInputs() {
  const id = document.getElementById('datasetSelect').value;
  const ds = (state.datasets?.datasets || []).find((d) => d.id === id);
  if (!ds) return;
  updateDatasetLinks();
  const cem = await toFile(ds.files.cem, `${id}-cem.xlsx`);
  const mad = await toFile(ds.files.mad, `${id}-mad.xlsx`);
  const cam = await toFile(ds.files.cam, `${id}-cam.xlsx`);
  const a = new DataTransfer();
  a.items.add(cem);
  document.getElementById('fileCem').files = a.files;
  const b = new DataTransfer();
  b.items.add(mad);
  document.getElementById('fileMad').files = b.files;
  const c = new DataTransfer();
  c.items.add(cam);
  document.getElementById('fileCam').files = c.files;
  document.getElementById('uploadOut').textContent = `${id} loaded. Click Upload all 3 & process.`;
}

async function uploadModule(module) {
  const inputId = module === 'cem' ? 'fileCem' : module === 'mad' ? 'fileMad' : 'fileCam';
  const input = document.getElementById(inputId);
  const out = document.getElementById('uploadOut');
  if (!input.files?.length) throw new Error(`Choose a .xlsx for ${module.toUpperCase()} first`);
  const form = new FormData();
  form.append('file', input.files[0]);
  out.textContent = `Uploading ${module.toUpperCase()}…`;
  const body = await api(`/api/filing/upload/${module}`, { method: 'POST', body: form });
  state.filing = body.snapshot;
  renderFlow();
  renderForms();
  out.textContent = JSON.stringify(
    {
      module: body.module,
      routedTo: body.routedTo,
      fileName: body.fileName,
      entity: state.filing.entity?.legalName,
      ordinary: state.filing.taxComputation?.ordinaryBusinessIncome,
      packageId: state.filing.printPackage?.packageId,
      dataFlow: state.filing.dataFlow?.nodes?.map((n) => `${n.id}:${n.status}`),
    },
    null,
    2
  );
}

async function uploadAllAndProcess() {
  await uploadModule('cem');
  await uploadModule('mad');
  await uploadModule('cam');
}

async function resetFiling() {
  state.filing = await api('/api/filing/reset', { method: 'POST' });
  renderFlow();
  renderForms();
  document.getElementById('uploadOut').textContent = 'Engagement reset. Upload CEM → MAD → CAM.';
}

function wire() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.view, btn.dataset.module));
  });
  document.getElementById('refreshAll').addEventListener('click', async () => {
    await Promise.all([loadFiling(), refreshHealth()]);
  });
  document.querySelectorAll('[data-upload]').forEach((btn) => {
    btn.addEventListener('click', () => uploadModule(btn.dataset.upload).catch((err) => alert(err.message)));
  });
  document.getElementById('datasetSelect').addEventListener('change', updateDatasetLinks);
  document.getElementById('btnLoadDataset').addEventListener('click', () => loadDatasetFilesIntoInputs().catch(alert));
  document.getElementById('btnUploadAll').addEventListener('click', () => uploadAllAndProcess().catch((err) => alert(err.message)));
  document.getElementById('btnReset').addEventListener('click', () => resetFiling().catch(alert));
}

async function boot() {
  wire();
  await Promise.all([loadFiling(), refreshHealth(), loadDatasets().catch(() => null)]);
}

boot().catch((err) => {
  document.getElementById('healthPill').textContent = err.message;
  document.getElementById('healthPill').className = 'pill bad';
});
