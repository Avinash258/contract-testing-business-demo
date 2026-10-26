/**
 * v2 APIs for CLM (Client Management) and MDM (Master Data / legacy MAD).
 * Mounted under /v2/* on each service; reachable via /api/proxy/CLM|MDM/v2/...
 */
const store = require('./filingStore');
const dataFlow = require('./dataFlow');

function attachClmV2(app) {
  /** Rich engagement snapshot (v2 shape). */
  app.get('/v2/engagement', (_req, res) => {
    const s = store.read();
    const payload = dataFlow.clmPayload(s);
    const ready = dataFlow.hasClm(s);
    res.json({
      apiVersion: 2,
      service: 'CLM',
      ready,
      engagement: {
        ...payload,
        bannerName: payload.entityName || null,
        importedAt: s.imports?.clm?.importedAt || s.imports?.cem?.importedAt || null,
        fileName: s.imports?.clm?.fileName || s.imports?.cem?.fileName || null,
      },
      links: {
        upload: '/upload',
        contractCt00: '/contracts/ct-00/engagement-context',
        downstreamMdm: '/downstream/MDM',
        v1Health: '/health',
      },
    });
  });

  /** Compact readiness for CLM. */
  app.get('/v2/status', (_req, res) => {
    const s = store.read();
    res.json({
      apiVersion: 2,
      service: 'CLM',
      ready: dataFlow.hasClm(s),
      engagementId: s.engagementId || null,
      entityName: s.entityName || s.entity?.legalName || null,
      taxYear: s.taxYear || null,
      correlationId: s.correlationId || null,
      feeds: ['MDM', 'ACC', 'TAX'],
    });
  });

  /** Partial update of engagement fields (demo). */
  app.patch('/v2/engagement', (req, res) => {
    const s = store.read();
    if (!dataFlow.hasClm(s) && !s.engagementId) {
      return res.status(409).json({
        apiVersion: 2,
        error: 'No engagement loaded — upload CLM Excel first (POST /upload)',
      });
    }
    const body = req.body || {};
    const allowed = ['entityName', 'taxYear', 'dueDate', 'formType', 'jurisdiction', 'states'];
    const updated = [];
    for (const key of allowed) {
      if (body[key] !== undefined) {
        s[key] = body[key];
        updated.push(key);
        if (key === 'entityName' && body.entityName) {
          s.entity = { ...(s.entity || {}), legalName: body.entityName };
        }
      }
    }
    if (!updated.length) {
      return res.status(400).json({
        apiVersion: 2,
        error: `Provide at least one of: ${allowed.join(', ')}`,
      });
    }
    store.write(s);
    store.log(s, 'clm.v2.engagement_patch', { updated });
    res.json({
      apiVersion: 2,
      service: 'CLM',
      updated,
      engagement: dataFlow.clmPayload(store.read()),
    });
  });
}

function attachMdmV2(app) {
  /** Entity master record (v2). */
  app.get('/v2/entity', (_req, res) => {
    const s = store.read();
    if (!dataFlow.hasMdm(s)) {
      return res.status(404).json({
        apiVersion: 2,
        service: 'MDM',
        error: 'No MDM entity loaded — upload MDM Excel after CLM',
        needs: ['CLM'],
      });
    }
    res.json({
      apiVersion: 2,
      service: 'MDM',
      entity: s.entity,
      engagementId: s.engagementId || null,
      importedAt: s.imports?.mdm?.importedAt || s.imports?.mad?.importedAt || null,
      links: {
        partners: '/v2/partners',
        ownership: '/v2/ownership',
        contractCt01: '/contracts/ct-01/entities',
      },
    });
  });

  /** Partner list (v2). */
  app.get('/v2/partners', (_req, res) => {
    const s = store.read();
    if (!dataFlow.hasMdm(s)) {
      return res.status(404).json({
        apiVersion: 2,
        service: 'MDM',
        error: 'No MDM partners loaded',
      });
    }
    const partners = s.partners || [];
    res.json({
      apiVersion: 2,
      service: 'MDM',
      count: partners.length,
      partners,
      links: {
        entity: '/v2/entity',
        ownership: '/v2/ownership',
        contractCt03: '/contracts/ct-03/ownership',
      },
    });
  });

  /** Ownership totals / validation helper (v2). */
  app.get('/v2/ownership', (_req, res) => {
    const s = store.read();
    if (!dataFlow.hasMdm(s)) {
      return res.status(404).json({
        apiVersion: 2,
        service: 'MDM',
        error: 'No MDM partners loaded',
      });
    }
    const partners = s.partners || [];
    const sum = (field) =>
      partners.reduce((n, p) => n + Number(p[field] != null ? p[field] : p.ownershipPct || 0), 0);
    const ownershipPct = Math.round(sum('ownershipPct') * 100) / 100;
    const profitPct = Math.round(sum('profitPct') * 100) / 100;
    const lossPct = Math.round(sum('lossPct') * 100) / 100;
    const ok = Math.abs(ownershipPct - 100) < 0.01;
    res.json({
      apiVersion: 2,
      service: 'MDM',
      partnerCount: partners.length,
      totals: {
        ownershipPct,
        profitPct: profitPct || ownershipPct,
        lossPct: lossPct || ownershipPct,
      },
      valid: ok,
      message: ok ? 'Ownership totals 100%' : `Ownership sums to ${ownershipPct}% (expected 100%)`,
      byPartner: partners.map((p) => ({
        partnerId: p.partnerId,
        name: p.name,
        ownershipPct: p.ownershipPct,
      })),
    });
  });

  app.get('/v2/status', (_req, res) => {
    const s = store.read();
    res.json({
      apiVersion: 2,
      service: 'MDM',
      ready: dataFlow.hasMdm(s),
      needsClm: !dataFlow.hasClm(s),
      entityId: s.entity?.entityId || null,
      legalName: s.entity?.legalName || null,
      partnerCount: (s.partners || []).length,
      feeds: ['ACC', 'TAX', 'ALC', 'DOC'],
    });
  });
}

function attachV2Apis(app, serviceId) {
  if (serviceId === 'CLM') attachClmV2(app);
  if (serviceId === 'MDM') attachMdmV2(app);
}

module.exports = { attachV2Apis, attachClmV2, attachMdmV2 };
