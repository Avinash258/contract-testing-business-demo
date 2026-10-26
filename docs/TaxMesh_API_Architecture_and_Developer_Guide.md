# TAXMESH — API Architecture & Developer Guide

**Microservices · Contract Catalog · Filing Workflow · Data-flow APIs · API Testing**

Version **1.2** | Aligned to running TaxMesh demo | Local development

---

## Document purpose

This guide is the developer-facing reference for TaxMesh: logical architecture, workspace codes, gateway routes, filing orchestration, contracts CT-00…CT-17, **downstream / upstream** data-flow APIs, reverse-contract interactions, Excel uploads, quality gates, TAX/ALC business validation, errors, and automation.

**Accuracy:** Paths and behaviors match the current codebase (`gateway`, `services/*`, `shared/*`). Letter aliases A–E and legacy codes (CEM/MAD/CAM/TIM/RPAM/FORMS) are accepted on the gateway proxy.

## Contents

1. Platform overview and architecture  
2. Microservices and ports  
3. Filing workflow and orchestration endpoints  
4. Downstream / upstream data-flow APIs  
5. Contract catalog CT-00 through CT-17  
6. How producer-consumer calls work  
7. Reverse (upstream) contracts and issue resolution  
8. Excel templates and upload APIs  
9. Quality gates and business validations  
10. Gateway and service-level endpoints  
11. Error handling and troubleshooting  
12. API automation and CI validation  
13. Security, observability and production-readiness checklist  
14. Related files and quick reference  

---

## 1. Platform overview and architecture

TaxMesh supports a Form **1065** tax filing journey:

**CLM → MDM → ACC → TAX → ALC → DOC / E-file**

| Workspace | Code |
|-----------|------|
| Client Management | CLM |
| Master Data | MDM |
| Accounting | ACC |
| Tax Computation | TAX |
| Allocations | ALC |
| Forms & Documents | DOC |

The gateway runs on port **4100** and provides the SPA, filing orchestration, **data-flow APIs**, service proxy, health checks, contract discovery, and Swagger/OpenAPI.

**Upload-driven flow (primary UI path):**

1. Upload **CLM + MDM** → consumed by ACC and TAX.  
2. Upload **ACC** → joins CLM + MDM, pushes into TAX and ALC.  
3. TAX + ALC calculate (validated) → DOC package.

**Service-letter mapping:** **A = MDM, B = ACC, C = TAX, D = ALC, E = DOC**. CLM has no letter. Prefer `/api/proxy/MDM/…` or `/api/proxy/A/…` equivalently. Legacy `/api/proxy/MAD/…` still resolves to MDM.

---

## 2. Microservices and ports

| Service / ID | Letter | Port | Responsibility | Example base URL |
|--------------|--------|------|----------------|------------------|
| Gateway | — | 4100 | UI, filing, flow APIs, proxy, Swagger | http://127.0.0.1:4100 |
| CLM | — | 4101 | Client Management — engagement, **entity name** | http://127.0.0.1:4101 |
| MDM | A | 4102 | Master Data — entities, tax attributes, ownership | http://127.0.0.1:4102 |
| ACC | B | 4103 | Accounting — trial balance | http://127.0.0.1:4103 |
| TAX | C | 4104 | Tax Computation + business validation | http://127.0.0.1:4104 |
| ALC | D | 4105 | Allocations + business validation | http://127.0.0.1:4105 |
| DOC | E | 4106 | Forms & Documents — 1065 package and e-file | http://127.0.0.1:4106 |

### Gateway entry points

```
Swagger UI:      http://127.0.0.1:4100/api-docs
OpenAPI JSON:    http://127.0.0.1:4100/openapi.json
Gateway health:  http://127.0.0.1:4100/api/health
Architecture:    http://127.0.0.1:4100/api/architecture
Data flow:       http://127.0.0.1:4100/api/flow
```

**Swagger behind tunnels:** OpenAPI defaults to same-origin server `/` so **Try it out** uses the public host (e.g. `*.trycloudflare.com`). Optional: `PUBLIC_BASE_URL=https://your-host`.

---

## 3. Filing workflow and orchestration endpoints

Filing orchestration is exposed at `/api/filing/*` on the gateway.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/filing` | Engagement snapshot, steps, gates, issues, dataFlow |
| POST | `/api/filing/reset` | **Blank** reset — clears banner + uploads + calcs |
| POST | `/api/filing/run/{stepId}` | Run one step: cem, setup, books, tax, allocate, forms, efile |
| POST | `/api/filing/run-all` | Load demo seed then full journey through MeF |
| POST | `/api/filing/process-flow` | Re-run TAX → ALC → DOC after uploads |
| GET | `/api/filing/data-flow` | Consumption graph for UI |
| GET | `/api/filing/form1065` | Form lines, K-1s, package, e-file |
| GET | `/api/filing/gates` | AQG1–AQG5 quality gate state |
| GET | `/api/filing/jobs` | Asynchronous job history |
| POST | `/api/filing/issues/{id}/resolve` | Resolve a reverse-contract issue |
| PATCH | `/api/filing/entity` | Update entity fields |
| GET | `/api/filing/datasets` | List five demo Excel datasets |
| POST | `/api/filing/upload/clm` | Upload CLM `.xlsx`; multipart field `file` |
| POST | `/api/filing/upload/mdm` | Upload MDM `.xlsx`; sheets Entity and Partners |
| POST | `/api/filing/upload/acc` | Upload ACC `.xlsx`; TrialBalance → auto TAX/ALC/DOC |
| GET | `/api/filing/validate/tax` | TAX business validation report |
| GET | `/api/filing/validate/alc` | ALC business validation report |
| POST | `/api/filing/tax/calculate` | Execute TAX calculation |
| POST | `/api/filing/alc/allocate` | Execute ALC allocations |

Legacy upload paths `/upload/cem|mad|cam` map to CLM/MDM/ACC.

### Examples

```bash
curl -X POST "http://127.0.0.1:4100/api/filing/run/tax"
curl -X POST "http://127.0.0.1:4100/api/filing/run-all"
curl -X POST "http://127.0.0.1:4100/api/filing/reset"
```

**Reset behavior:** engagement, project, entity name, EIN, tax year, and package become empty (`—` in UI). Module cards return to empty/blocked until Excel is uploaded again.

---

## 4. Downstream / upstream data-flow APIs

| Term | Meaning |
|------|---------|
| **Downstream** | Forward along the journey (producer earlier → consumer later) |
| **Upstream** | Reverse / feedback ask (`direction: reverse` in the contract catalog) |

### Gateway

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/flow` | Full catalog — peers, edges, endpoint map |
| GET | `/api/flow/edges?direction=` | Filter edges |
| GET | `/api/flow/downstream/{from}/{to}` | Pair payloads (sample + live) |
| GET | `/api/flow/upstream/{from}/{to}` | Upstream pair payloads |
| GET | `/api/contracts?direction=&producer=&consumer=` | Filter CT list |

### Per service (`/api/proxy/{CLM\|MDM\|ACC\|TAX\|ALC\|DOC}/…`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/flow` | This service’s down/up peers and contracts |
| GET | `/contracts/downstream` | Direction-scoped catalog |
| GET | `/contracts/upstream` | Direction-scoped catalog |
| GET | `/downstream/{peer}` | Produce payloads to peer |
| GET | `/upstream/{peer}` | Produce upstream payloads to peer |
| GET | `/consume/downstream` | Batch-pull all downstream inputs |
| GET | `/consume/upstream` | Batch-pull all upstream inputs |
| GET | `/pipeline?direction=` | Reachability (optional filter) |

```bash
curl http://127.0.0.1:4100/api/flow
curl http://127.0.0.1:4100/api/flow/downstream/MDM/TAX
curl http://127.0.0.1:4100/api/proxy/MDM/downstream/TAX
curl http://127.0.0.1:4100/api/proxy/TAX/upstream/MDM
curl http://127.0.0.1:4100/api/proxy/TAX/consume/downstream
```

Counts: **10** downstream + **8** upstream = **18** contracts (CT-00…CT-17).

---

## 5. Contract catalog: CT-00 through CT-17

| ID | Producer | Consumer | Direction | Gateway endpoint | Purpose |
|----|----------|----------|-----------|------------------|---------|
| CT-00 | CLM | MDM | Downstream | `/api/proxy/CLM/contracts/ct-00/engagement-context` | Engagement / project / job |
| CT-01 | MDM / A | ACC / B | Downstream | `/api/proxy/A/contracts/ct-01/entities` | Entities for account mapping |
| CT-02 | MDM / A | TAX / C | Downstream | `/api/proxy/A/contracts/ct-02/tax-attributes` | Entity tax attributes |
| CT-03 | MDM / A | ALC / D | Downstream | `/api/proxy/A/contracts/ct-03/ownership` | Partner ownership |
| CT-04 | MDM / A | DOC / E | Downstream | `/api/proxy/A/contracts/ct-04/filing-meta` | Filing metadata |
| CT-05 | ACC / B | MDM / A | Upstream | `/api/proxy/B/contracts/ct-05/mapping-gaps` | Missing entity/account codes |
| CT-06 | ACC / B | TAX / C | Downstream | `/api/proxy/B/contracts/ct-06/book-balances` | Book account balances |
| CT-07 | ACC / B | ALC / D | Downstream | `/api/proxy/B/contracts/ct-07/capital-map` | Capital account mappings |
| CT-08 | TAX / C | MDM / A | Upstream | `/api/proxy/C/contracts/ct-08/attribute-gaps` | Tax attribute corrections |
| CT-09 | TAX / C | ACC / B | Upstream | `/api/proxy/C/contracts/ct-09/btt-asks` | Book-to-tax reconciliation asks |
| CT-10 | TAX / C | ALC / D | Downstream | `/api/proxy/C/contracts/ct-10/taxable-income` | Taxable income buckets |
| CT-11 | TAX / C | DOC / E | Downstream | `/api/proxy/C/contracts/ct-11/tax-summary` | Tax computation summary |
| CT-12 | ALC / D | MDM / A | Upstream | `/api/proxy/D/contracts/ct-12/ownership-issues` | Ownership validation issues |
| CT-13 | ALC / D | TAX / C | Upstream | `/api/proxy/D/contracts/ct-13/allocation-needs` | Adjusted tax amount needs |
| CT-14 | ALC / D | DOC / E | Downstream | `/api/proxy/D/contracts/ct-14/partner-allocations` | Partner allocations / K-1 |
| CT-15 | DOC / E | MDM / A | Upstream | `/api/proxy/E/contracts/ct-15/entity-print-needs` | Legal name / EIN for forms |
| CT-16 | DOC / E | TAX / C | Upstream | `/api/proxy/E/contracts/ct-16/tax-line-needs` | Tax line amounts for forms |
| CT-17 | DOC / E | ALC / D | Upstream | `/api/proxy/E/contracts/ct-17/capital-restatement` | Partner capital restatement |

---

## 6. How producer-consumer API calls work

1. **Producer endpoint:** `/api/proxy/{producer}/contracts/ct-XX/...` returns a payload owned by the producer.  
2. **Consumer endpoint:** `/api/proxy/{consumer}/consume/{contractId}` pulls a contract it consumes.  
3. **Pipeline endpoint:** `/api/proxy/{service}/pipeline` checks reachability for contracts that service consumes.  
4. **Peer flow:** `/api/proxy/{from}/downstream/{to}` or `/upstream/{to}` returns all contracts on that edge.

### Example: ACC → TAX via CT-06

```bash
curl http://127.0.0.1:4100/api/proxy/B/contracts/ct-06/book-balances
curl http://127.0.0.1:4100/api/proxy/C/consume/CT-06
curl http://127.0.0.1:4100/api/proxy/C/pipeline
curl http://127.0.0.1:4100/api/flow/downstream/ACC/TAX
```

### Example CT-11 tax summary payload (sample shape)

```json
{
  "contractId": "CT-11",
  "engagementId": "ENG-2025-1065-001",
  "entityId": "ENT-ALPHA-LP",
  "taxSummary": {
    "federalTaxableIncome": 1197000,
    "stateApportionment": { "NY": 0.62, "CA": 0.38 },
    "status": "computed",
    "version": "TIM-2025.1"
  },
  "producer": "TAX",
  "consumer": "DOC",
  "direction": "downstream",
  "flow": "downstream"
}
```

Live amounts after Excel upload come from the filing engine, not only the static sample.

---

## 7. Reverse (upstream) contracts and issue resolution

| Contract | Flow | Typical issue / requirement |
|----------|------|-----------------------------|
| CT-05 | ACC → MDM | Entity or account mapping gap |
| CT-08 | TAX → MDM | Tax attribute correction |
| CT-09 | TAX → ACC | Book-to-tax reconciliation request |
| CT-12 | ALC → MDM | Ownership validation issue |
| CT-13 | ALC → TAX | Adjusted tax amount needed |
| CT-15 | DOC → MDM | Legal name / EIN needed |
| CT-16 | DOC → TAX | Tax line amounts needed |
| CT-17 | DOC → ALC | Partner capital restatement needed |

**Recommended sequence:** inspect issue → correct owning service data → `POST /api/filing/issues/{id}/resolve` → revalidate / re-run affected steps → confirm downstream artifact.

---

## 8. Excel templates and upload APIs

| Module | Workbook / sheet | Required columns or rules |
|--------|------------------|---------------------------|
| CLM | `clm.xlsx` · Engagement | clientId, engagementId, projectId, entityGroupId, jobId, **entityName**, taxYear, dueDate, formType, jurisdiction, states |
| MDM | `mdm.xlsx` · Entity + Partners | Entity + partners; ownership totals **100%** |
| ACC | `acc.xlsx` · TrialBalance | accountCode, accountName, bookAmount, schedule (driver codes 4000/5000/6100/6200 used by TAX) |

Five demo data sets: `testdata/set-01` … `testdata/set-05`. Regenerate: `npm run generate:excel`.

- **set-01** — compact baseline (2 partners, 7 TB accounts)  
- **set-02…05** — dynamic partners (3–5) and full Schedule L/K/M-1 trial balance (~26 accounts)

**Entity name** is established by the **CLM** upload (`entityName`) and shown on the engagement banner. MDM supplies EIN and partner capital detail.

### CLM upload example

```bash
curl -X POST "http://127.0.0.1:4100/api/filing/upload/clm" \
  -F "file=@testdata/set-01/clm.xlsx"
```

Multipart field name is **`file`**. Also: `/api/filing/upload/mdm`, `/api/filing/upload/acc`.

### Direct service upload routes

```
CLM:  POST http://127.0.0.1:4101/upload
MDM:  POST http://127.0.0.1:4102/upload
ACC:  POST http://127.0.0.1:4103/upload
```

ZIP downloads: `/download/testdata.zip`, `/download/testdata/set-01.zip`, …

---

## 9. Quality gates and business validations

| Gate | Boundary | Validation focus |
|------|----------|------------------|
| AQG1 | CLM → MDM | Engagement/entity identity and master data |
| AQG2 | MDM/ACC → TAX | Ownership, accounts, mapping readiness |
| AQG3 | TAX calculation | M-1 identity, tax computation status |
| AQG4 | TAX → ALC → DOC | Allocation / K-1 reconcile to TAX |
| AQG5 | Full transaction / MeF | End-to-end filing readiness |

### TAX business validation (examples)

- CLM / MDM / ACC prerequisites present  
- Tax year and EIN format  
- Account **4000** required; 5000 / 6100 / 6200 recommended  
- No duplicate account codes  
- State apportionment factors sum to 1.00  
- Schedule M-1 rolls to ordinary business income  

APIs: `GET /api/filing/validate/tax`, `POST /api/filing/tax/calculate`, or TAX service `GET /validate`, `POST /calculate`.

### ALC business validation (examples)

- ≥ 2 partners; unique partner / capital IDs  
- Ownership, profit, and loss % each total 100%  
- Allocated ordinary (and GP) reconcile to TAX  
- Capital rollforward consistency  

APIs: `GET /api/filing/validate/alc`, `POST /api/filing/alc/allocate`, or ALC service `GET /validate`, `POST /allocate`.

Failed validation returns **HTTP 422** with a findings list and does not advance DOC until corrected.

---

## 10. Gateway and common service endpoints

| Scope | Method | Path | Purpose |
|-------|--------|------|---------|
| Gateway | GET | `/api/health` | Gateway and services health |
| Gateway | GET | `/api/architecture` | Services, contract catalog, matrix |
| Gateway | GET | `/api/flow` | Downstream + upstream catalog |
| Gateway | GET | `/api/contracts` | Filtered contract list |
| Gateway | GET | `/api/contracts/{id}` | Contract metadata and sample payload |
| Gateway | GET | `/openapi.json` | OpenAPI 3.0 document |
| Gateway | GET | `/api-docs` | Swagger UI |
| Each service | GET | `/health` | Liveness and contract IDs |
| Each service | GET | `/contracts` | Produced/consumed lists |
| Each service | GET | `/flow` | Direction peers |
| Each service | GET | `/pipeline` | Reachability for consumed producers |
| Each service | GET | `/consume/{contractId}` | Fetch a consumed producer payload |
| Producer | GET | `/contracts/ct-XX/...` | Producer payload for a contract |

Gateway proxy: `/api/proxy/{CLM|MDM|ACC|TAX|ALC|DOC|A|B|C|D|E|CEM|…}/…`  
Example: `GET /api/proxy/C/health` ≡ `GET /api/proxy/TAX/health`.

---

## 11. Error handling and troubleshooting

| HTTP status | Meaning | Action |
|-------------|---------|--------|
| 400 | Bad request / Excel / missing CLM before MDM or CLM+MDM before ACC | Fix upload order or file content |
| 404 | Unknown contract/service, or consume of a CT the service does not consume | Check IDs and consumer relationship |
| 422 | TAX/ALC business validation failed | Read `findings` / `validation` in body |
| 502 | Producer unreachable during consume or pipeline | Check producer health, port, logs |
| 500 | Unexpected server error | Inspect logs; correlate request |

Example error payload:

```json
{
  "error": "Producer unreachable",
  "contractId": "CT-01",
  "detail": "fetch failed"
}
```

---

## 12. API automation and CI validation

### Contract suite

```bash
npm run test:contracts
```

Asserts producer endpoints return `contractId` plus required payload keys.

### Recommended automation layers

| Layer | Coverage |
|-------|----------|
| 1. Health | Gateway and all six services |
| 2. Producer contract | CT-00…CT-17 schema / IDs |
| 3. Consumer integration | `/consume/{id}` and `/consume/downstream` |
| 4. Upstream / reverse | Issue payloads and resolve workflow |
| 5. Business validations | TAX/ALC validate + ownership / M-1 rules |
| 6. End-to-end | Upload CLM→MDM→ACC → forms/package |
| 7. Flow APIs | `/api/flow` and peer downstream/upstream |

### Playwright API test example

```javascript
import { test, expect } from "@playwright/test";

const baseURL = "http://127.0.0.1:4100";

test("CT-11 tax summary contract is valid", async ({ request }) => {
  const response = await request.get(
    `${baseURL}/api/proxy/C/contracts/ct-11/tax-summary`
  );
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.contractId).toBe("CT-11");
  expect(body.taxSummary).toBeTruthy();
  expect(body.taxSummary.status).toBe("computed");
});
```

Avoid `POST /api/filing/reset` against shared environments.

---

## 13. Security, observability and production-readiness checklist

- Document authentication/authorization if required in deployed environments.  
- Keep OpenAPI schemas, required/nullable fields, and examples current.  
- Document job lifecycle, polling, timeouts, retries, terminal states.  
- Specify idempotency for filing operations.  
- Protect taxpayer data; mask identifiers in logs/reports.  
- Propagate correlation/request IDs across gateway and services.  
- Document timeouts, dependency health, and failure behavior.  
- Version contracts; define backward-compatibility rules.  
- Restrict demo **reset** from production access.  
- Use environment-specific base URLs — OpenAPI prefers same-origin `/` behind proxies; set `PUBLIC_BASE_URL` when needed.

---

## 14. Related files and quick reference

| File | Purpose |
|------|---------|
| `APPLICATION_MANUAL.md` | Installation, UI walkthrough, demo script |
| `ARCHITECTURE.md` | Microservice and contract architecture |
| `API.md` | Condensed API reference |
| `../CASE_STUDY.md` | Business case-study brief |
| `../README.md` | Project overview & quick start |
| `postman/TaxMesh.postman_collection.json` | Postman collection |
| `openapi.json` | Machine-readable OpenAPI |
| `testdata/set-0N/{clm,mdm,acc}.xlsx` | Demo Excel workbooks |

### Quick reference

```
Gateway:       http://127.0.0.1:4100
Swagger:       /api-docs
OpenAPI:       /openapi.json
Health:        /api/health
Architecture:  /api/architecture
Data flow:     /api/flow
Filing:        /api/filing
Upload:        /api/filing/upload/{clm|mdm|acc}
Validate TAX:  /api/filing/validate/tax
Validate ALC:  /api/filing/validate/alc
Contracts:     CT-00 through CT-17
Letters:       A=MDM B=ACC C=TAX D=ALC E=DOC
Codes:         CLM MDM ACC TAX ALC DOC
Contract test: npm run test:contracts
Excel regen:   npm run generate:excel
Guide DOCX:    npm run generate:guide
```

---

*End of document. Version 1.2 — CLM/MDM/ACC/TAX/ALC/DOC codes, clm/mdm/acc.xlsx testdata, downstream/upstream flow APIs, blank reset, entityName, TAX/ALC validation, A–E + legacy proxy aliases, tunnel-safe Swagger.*
