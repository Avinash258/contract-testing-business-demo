# TAXMESH — API Architecture & Developer Guide

**Microservices · Contract Catalog · Filing Workflow · API Testing**

Version **1.1** | Aligned to running TaxMesh demo | Local development

---

## Document purpose

This guide is the developer-facing reference for TaxMesh: logical architecture, service responsibilities, gateway routes, filing orchestration, contracts CT-00…CT-17, reverse-contract interactions, Excel uploads, quality gates, TIM/RPAM business validation, errors, and automation.

**Accuracy:** Paths and behaviors below match the current codebase (`gateway`, `services/*`, `shared/*`). Letter aliases A–E are supported on the gateway proxy for guide compatibility.

## Contents

1. Platform overview and architecture  
2. Microservices and ports  
3. Filing workflow and orchestration endpoints  
4. Contract catalog CT-00 through CT-17  
5. How producer-consumer calls work  
6. Reverse contracts and issue resolution  
7. Excel templates and upload APIs  
8. Quality gates and business validations  
9. Gateway and service-level endpoints  
10. Error handling and troubleshooting  
11. API automation and CI validation  
12. Security, observability and production-readiness checklist  
13. Related files and quick reference  

---

## 1. Platform overview and architecture

TaxMesh supports a Form **1065** tax filing journey:

**CEM → MAD → CAM → TIM → RPAM → Forms Print / E-file**

The gateway runs on port **4100** and provides the SPA, filing orchestration, service proxy, health checks, contract discovery, and Swagger/OpenAPI.

**Upload-driven flow (primary UI path):**

1. Upload **CEM + MAD** → consumed by CAM and TIM.  
2. Upload **CAM** → joins CEM + MAD, pushes into TIM and RPAM.  
3. TIM + RPAM calculate (validated) → Forms Print package.

**Service-letter mapping** used by contract proxy routes: **A = MAD, B = CAM, C = TIM, D = RPAM, E = FORMS**. CEM is a separate engagement service (no letter). Prefer `/api/proxy/MAD/…` or `/api/proxy/A/…` equivalently.

---

## 2. Microservices and ports

| Service / ID | Letter | Port | Responsibility | Example base URL |
|--------------|--------|------|----------------|------------------|
| Gateway | — | 4100 | UI, filing orchestration, proxy, Swagger | http://127.0.0.1:4100 |
| CEM | — | 4101 | Client engagement, filing context, **entity name** | http://127.0.0.1:4101 |
| MAD | A | 4102 | Master data, entities, tax attributes, ownership | http://127.0.0.1:4102 |
| CAM | B | 4103 | Accounting and trial balance | http://127.0.0.1:4103 |
| TIM | C | 4104 | Tax engine + business validation | http://127.0.0.1:4104 |
| RPAM | D | 4105 | Partner allocations + business validation | http://127.0.0.1:4105 |
| FORMS | E | 4106 | Forms print, Form 1065 package and e-file | http://127.0.0.1:4106 |

### Gateway entry points

```
Swagger UI:      http://127.0.0.1:4100/api-docs
OpenAPI JSON:    http://127.0.0.1:4100/openapi.json
Gateway health:  http://127.0.0.1:4100/api/health
Architecture:    http://127.0.0.1:4100/api/architecture
```

---

## 3. Filing workflow and orchestration endpoints

Filing orchestration is exposed at `/api/filing/*` on the gateway.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/filing` | Engagement snapshot, steps, gates, issues, dataFlow |
| POST | `/api/filing/reset` | **Blank** reset (demo only) — clears banner + uploads + calcs |
| POST | `/api/filing/run/{stepId}` | Run one step: cem, setup, books, tax, allocate, forms, efile |
| POST | `/api/filing/run-all` | Load demo seed then full journey through MeF |
| POST | `/api/filing/process-flow` | Re-run TIM → RPAM → Forms after uploads |
| GET | `/api/filing/data-flow` | Consumption graph for UI |
| GET | `/api/filing/form1065` | Form lines, K-1s, package, e-file |
| GET | `/api/filing/gates` | AQG1–AQG5 quality gate state |
| GET | `/api/filing/jobs` | Asynchronous job history |
| POST | `/api/filing/issues/{id}/resolve` | Resolve a reverse-contract issue |
| PATCH | `/api/filing/entity` | Update entity fields |
| GET | `/api/filing/datasets` | List five demo Excel datasets |
| POST | `/api/filing/upload/cem` | Upload CEM `.xlsx`; multipart field `file` |
| POST | `/api/filing/upload/mad` | Upload MAD `.xlsx`; sheets Entity and Partners |
| POST | `/api/filing/upload/cam` | Upload CAM `.xlsx`; sheet TrialBalance → auto TIM/RPAM/Forms |
| GET | `/api/filing/validate/tim` | TIM business validation report |
| GET | `/api/filing/validate/rpam` | RPAM business validation report |
| POST | `/api/filing/tim/calculate` | Execute TIM calculation |
| POST | `/api/filing/rpam/allocate` | Execute RPAM allocations |

### Examples

```bash
curl -X POST "http://127.0.0.1:4100/api/filing/run/tax"
curl -X POST "http://127.0.0.1:4100/api/filing/run-all"
curl -X POST "http://127.0.0.1:4100/api/filing/reset"
```

**Reset behavior:** engagement, project, entity name, EIN, tax year, and package become empty (`—` in UI). Module cards return to empty/blocked until Excel is uploaded again.

---

## 4. Contract catalog: CT-00 through CT-17

Downstream contracts provide business data to consumers. Reverse contracts provide gaps, requests, or correction requirements to upstream owners.

| ID | Producer | Consumer | Direction | Gateway endpoint | Purpose |
|----|----------|----------|-----------|------------------|---------|
| CT-00 | CEM | MAD | Downstream | `/api/proxy/CEM/contracts/ct-00/engagement-context` | Engagement / project / job |
| CT-01 | MAD / A | CAM / B | Downstream | `/api/proxy/A/contracts/ct-01/entities` | Entities for account mapping |
| CT-02 | MAD / A | TIM / C | Downstream | `/api/proxy/A/contracts/ct-02/tax-attributes` | Entity tax attributes |
| CT-03 | MAD / A | RPAM / D | Downstream | `/api/proxy/A/contracts/ct-03/ownership` | Partner ownership |
| CT-04 | MAD / A | FORMS / E | Downstream | `/api/proxy/A/contracts/ct-04/filing-meta` | Filing metadata |
| CT-05 | CAM / B | MAD / A | Reverse | `/api/proxy/B/contracts/ct-05/mapping-gaps` | Missing entity/account codes |
| CT-06 | CAM / B | TIM / C | Downstream | `/api/proxy/B/contracts/ct-06/book-balances` | Book account balances |
| CT-07 | CAM / B | RPAM / D | Downstream | `/api/proxy/B/contracts/ct-07/capital-map` | Capital account mappings |
| CT-08 | TIM / C | MAD / A | Reverse | `/api/proxy/C/contracts/ct-08/attribute-gaps` | Tax attribute corrections |
| CT-09 | TIM / C | CAM / B | Reverse | `/api/proxy/C/contracts/ct-09/btt-asks` | Book-to-tax reconciliation asks |
| CT-10 | TIM / C | RPAM / D | Downstream | `/api/proxy/C/contracts/ct-10/taxable-income` | Taxable income buckets |
| CT-11 | TIM / C | FORMS / E | Downstream | `/api/proxy/C/contracts/ct-11/tax-summary` | Tax computation summary |
| CT-12 | RPAM / D | MAD / A | Reverse | `/api/proxy/D/contracts/ct-12/ownership-issues` | Ownership validation issues |
| CT-13 | RPAM / D | TIM / C | Reverse | `/api/proxy/D/contracts/ct-13/allocation-needs` | Adjusted tax amount needs |
| CT-14 | RPAM / D | FORMS / E | Downstream | `/api/proxy/D/contracts/ct-14/partner-allocations` | Partner allocations / K-1 |
| CT-15 | FORMS / E | MAD / A | Reverse | `/api/proxy/E/contracts/ct-15/entity-print-needs` | Legal name / EIN for forms |
| CT-16 | FORMS / E | TIM / C | Reverse | `/api/proxy/E/contracts/ct-16/tax-line-needs` | Tax line amounts for forms |
| CT-17 | FORMS / E | RPAM / D | Reverse | `/api/proxy/E/contracts/ct-17/capital-restatement` | Partner capital restatement |

---

## 5. How producer-consumer API calls work

Three concepts:

1. **Producer endpoint:** `/api/proxy/{producer}/contracts/ct-XX/...` returns a payload owned by the producer.  
2. **Consumer endpoint:** `/api/proxy/{consumer}/consume/{contractId}` checks the consumer can pull a contract it consumes.  
3. **Pipeline endpoint:** `/api/proxy/{service}/pipeline` checks reachability for contracts that service consumes.

### Example: CAM → TIM via CT-06

```bash
# 1. Inspect the producer payload
curl http://127.0.0.1:4100/api/proxy/B/contracts/ct-06/book-balances

# 2. Exercise the consumer-side contract call
curl http://127.0.0.1:4100/api/proxy/C/consume/CT-06

# 3. Check TIM's consumed-producer reachability
curl http://127.0.0.1:4100/api/proxy/C/pipeline
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
  "producer": "TIM",
  "consumer": "FORMS",
  "direction": "downstream"
}
```

Live amounts after Excel upload come from the filing engine, not the static sample.

---

## 6. Reverse contracts and issue resolution

| Reverse contract | Flow | Typical issue / requirement |
|------------------|------|-----------------------------|
| CT-05 | CAM → MAD | Entity or account mapping gap |
| CT-08 | TIM → MAD | Tax attribute correction |
| CT-09 | TIM → CAM | Book-to-tax reconciliation request |
| CT-12 | RPAM → MAD | Ownership validation issue |
| CT-13 | RPAM → TIM | Adjusted tax amount needed |
| CT-15 | FORMS → MAD | Legal name / EIN needed |
| CT-16 | FORMS → TIM | Tax line amounts needed |
| CT-17 | FORMS → RPAM | Partner capital restatement needed |

**Recommended sequence:** inspect issue → correct owning service data → `POST /api/filing/issues/{id}/resolve` → revalidate / re-run affected steps → confirm downstream artifact.

---

## 7. Excel templates and upload APIs

| Module | Workbook / sheet | Required columns or rules |
|--------|------------------|---------------------------|
| CLM | `clm.xlsx` · Engagement | clientId, engagementId, projectId, entityGroupId, jobId, **entityName**, taxYear, dueDate, formType, jurisdiction, states |
| MDM | `mdm.xlsx` · Entity + Partners | Entity + partners; ownership totals **100%** |
| ACC | `acc.xlsx` · TrialBalance | accountCode, accountName, bookAmount, schedule (driver codes 4000/5000/6100/6200 used by TAX) |

Five demo data sets: `testdata/set-01` … `testdata/set-05`. Regenerate: `npm run generate:excel`.

- **set-01** — compact baseline (2 partners, 7 TB accounts)  
- **set-02…05** — dynamic partners (3–5) and full Schedule L/K/M-1 trial balance (~26 accounts)

**Entity name** is established by the **CEM** upload (`entityName`) and shown on the engagement banner and CEM flow card. MAD supplies EIN and partner capital detail.

### CEM upload example

```bash
curl -X POST "http://127.0.0.1:4100/api/filing/upload/cem" \
  -F "file=@testdata/set-01/clm.xlsx"
```

Multipart field name is **`file`**. Equivalent: `/api/filing/upload/mad`, `/api/filing/upload/cam`.

### Direct service upload routes

```
CEM:  POST http://127.0.0.1:4101/upload
MAD:  POST http://127.0.0.1:4102/upload
CAM:  POST http://127.0.0.1:4103/upload
```

---

## 8. Quality gates and business validations

| Gate | Boundary | Validation focus |
|------|----------|------------------|
| AQG1 | CEM → MAD | Engagement/entity identity and master data |
| AQG2 | MAD/CAM → TIM | Ownership, accounts, mapping readiness |
| AQG3 | TIM calculation | M-1 identity, tax computation status |
| AQG4 | TIM → RPAM → Forms | Allocation / K-1 reconcile to TIM |
| AQG5 | Full transaction / MeF | End-to-end filing readiness |

### TIM business validation (examples)

- CEM / MAD / CAM prerequisites present  
- Tax year and EIN format  
- Account **4000** required; 5000 / 6100 / 6200 recommended  
- No duplicate account codes  
- State apportionment factors sum to 1.00  
- Schedule M-1 rolls to ordinary business income  

APIs: `GET /api/filing/validate/tim`, `POST /api/filing/tim/calculate`, or TIM service `GET /validate`, `POST /calculate`.

### RPAM business validation (examples)

- ≥ 2 partners; unique partner / capital IDs  
- Ownership, profit, and loss % each total 100%  
- Allocated ordinary (and GP) reconcile to TIM  
- Capital rollforward consistency  

APIs: `GET /api/filing/validate/rpam`, `POST /api/filing/rpam/allocate`, or RPAM service `GET /validate`, `POST /allocate`.

Failed validation returns **HTTP 422** with a findings list and does not advance Forms Print until corrected.

---

## 9. Gateway and common service endpoints

| Scope | Method | Path | Purpose |
|-------|--------|------|---------|
| Gateway | GET | `/api/health` | Gateway and services health |
| Gateway | GET | `/api/architecture` | Services, contract catalog, matrix |
| Gateway | GET | `/api/contracts/{id}` | Contract metadata and sample payload |
| Gateway | GET | `/openapi.json` | OpenAPI 3.0 document |
| Gateway | GET | `/api-docs` | Swagger UI |
| Each service | GET | `/health` | Liveness and contract IDs |
| Each service | GET | `/contracts` | Produced/consumed lists |
| Each service | GET | `/pipeline` | Reachability for consumed producers |
| Each service | GET | `/consume/{contractId}` | Fetch a consumed producer payload |
| Producer | GET | `/contracts/ct-XX/...` | Producer payload for a contract |

Gateway proxy form: `/api/proxy/{CEM|MAD|CAM|TIM|RPAM|FORMS|A|B|C|D|E}/…`  
Example: `GET /api/proxy/C/health` ≡ `GET /api/proxy/TIM/health`.

---

## 10. Error handling and troubleshooting

| HTTP status | Meaning | Action |
|-------------|---------|--------|
| 400 | Bad request / Excel / missing CEM before MAD or CEM+MAD before CAM | Fix upload order or file content |
| 404 | Unknown contract/service, or consume of a CT the service does not consume | Check IDs and consumer relationship |
| 422 | TIM/RPAM business validation failed | Read `findings` / `validation` in body |
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

A failed request does not by itself prove a business transaction was rolled back.

---

## 11. API automation and CI validation

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
| 3. Consumer integration | `/consume/{id}` for configured contracts |
| 4. Reverse-contract tests | Issue payloads and resolve workflow |
| 5. Business validations | TIM/RPAM validate + ownership / M-1 rules |
| 6. End-to-end | Upload CEM→MAD→CAM → forms/package |

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

## 12. Security, observability and production-readiness checklist

- Document authentication/authorization if required in deployed environments.  
- Keep OpenAPI schemas, required/nullable fields, and examples current.  
- Document job lifecycle, polling, timeouts, retries, terminal states.  
- Specify idempotency for filing operations.  
- Protect taxpayer data; mask identifiers in logs/reports.  
- Propagate correlation/request IDs across gateway and services.  
- Document timeouts, dependency health, and failure behavior.  
- Version contracts; define backward-compatibility rules.  
- Restrict demo **reset** from production access.  
- Use environment-specific base URLs — do not hardcode localhost in prod.

---

## 13. Related files and quick reference

| File | Purpose |
|------|---------|
| `APPLICATION_MANUAL.md` | Installation, UI walkthrough, demo script |
| `ARCHITECTURE.md` | Microservice and contract architecture |
| `API.md` | Condensed API reference |
| `CASE_STUDY.md` | Business case-study requirements (if present) |
| `postman/TaxMesh.postman_collection.json` | Postman collection |
| `openapi.json` | Machine-readable OpenAPI |
| `testdata/set-0N/*.xlsx` | Demo Excel workbooks |

### Quick reference

```
Gateway:       http://127.0.0.1:4100
Swagger:       /api-docs
OpenAPI:       /openapi.json
Health:        /api/health
Architecture:  /api/architecture
Filing:        /api/filing
Validate TIM:  /api/filing/validate/tim
Validate RPAM: /api/filing/validate/rpam
Contracts:     CT-00 through CT-17
Letters:       A=MAD B=CAM C=TIM D=RPAM E=FORMS
Contract test: npm run test:contracts
Excel regen:   npm run generate:excel
```

---

*End of document. Version 1.1 — reflects upload-driven flow, blank reset, CEM entityName, TIM/RPAM business validation, and A–E proxy aliases.*
