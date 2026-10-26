# TaxMesh API Documentation

**Base URL (gateway):** `http://127.0.0.1:4100`  
**OpenAPI / Swagger:** [/api-docs](http://127.0.0.1:4100/api-docs) · [/openapi.json](http://127.0.0.1:4100/openapi.json)  
**Full guide:** [TaxMesh_API_Architecture_and_Developer_Guide.md](TaxMesh_API_Architecture_and_Developer_Guide.md)

Journey:

**CLM → MDM → ACC → TAX → ALC → DOC / MeF**

Proxy: `/api/proxy/{CLM|MDM|ACC|TAX|ALC|DOC}/…` (legacy CEM/MAD/CAM/TIM/RPAM/FORMS aliases work)  
Letter aliases: **A=MDM, B=ACC, C=TAX, D=ALC, E=DOC**

---

## Data-flow APIs (downstream + upstream)

**Downstream** = journey-forward contracts (earlier → later).  
**Upstream** = reverse / feedback asks (later → earlier). Catalog field `direction: reverse` ≡ API `upstream`.

### Gateway

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/flow` | Full catalog: per-service down/up peers + all edges |
| GET | `/api/flow/edges?direction=` | Edge list (`downstream` \| `upstream`) |
| GET | `/api/flow/downstream/{from}/{to}` | e.g. `/api/flow/downstream/MDM/TAX` → CT-02 |
| GET | `/api/flow/upstream/{from}/{to}` | e.g. `/api/flow/upstream/TAX/MDM` → CT-08 |
| GET | `/api/contracts?direction=&producer=&consumer=` | Filter CT-00…CT-17 |

### Per microservice (via `/api/proxy/{svc}/…`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/flow` | Downstream + upstream peers and contracts |
| GET | `/contracts/downstream` | Produced + consumed downstream |
| GET | `/contracts/upstream` | Produced + consumed upstream |
| GET | `/downstream/{peer}` | Payloads this service sends downstream to peer |
| GET | `/upstream/{peer}` | Payloads this service sends upstream to peer |
| GET | `/consume/downstream` | Batch-pull all downstream inputs |
| GET | `/consume/upstream` | Batch-pull all upstream inputs |
| GET | `/pipeline?direction=` | Reachability probe (optional direction filter) |

```http
GET /api/proxy/MDM/downstream/TAX
GET /api/proxy/TAX/upstream/MDM
GET /api/proxy/TAX/consume/downstream
GET /api/flow/downstream/ACC/ALC
```

---

## Filing APIs (Form 1065 journey)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/filing` | Engagement snapshot, steps, gates, issues, **dataFlow** |
| POST | `/api/filing/reset` | **Blank** reset — clears banner, imports, calc, package |
| POST | `/api/filing/run/{stepId}` | `cem` \| `setup` \| `books` \| `tax` \| `allocate` \| `forms` \| `efile` |
| POST | `/api/filing/run-all` | Loads demo seed then full journey through MeF |
| POST | `/api/filing/process-flow` | Re-run TAX → ALC → DOC after CLM+MDM+ACC uploads |
| GET | `/api/filing/data-flow` | Upload-driven consumption graph |
| GET | `/api/filing/form1065` | Form lines, K-1s, package, e-file |
| GET | `/api/filing/gates` | AQG1–AQG5 |
| GET | `/api/filing/jobs` | Async job history |
| POST | `/api/filing/issues/{id}/resolve` | Resolve reverse-contract issue |
| PATCH | `/api/filing/entity` | Update entity fields |
| GET | `/api/filing/datasets` | List 5 demo Excel datasets |
| POST | `/api/filing/upload/clm` | Upload CLM `.xlsx` (`file` field) |
| POST | `/api/filing/upload/mdm` | Upload MDM `.xlsx` |
| POST | `/api/filing/upload/acc` | Upload ACC `.xlsx` → auto TAX → ALC → DOC |
| GET | `/api/filing/validate/tax` | TAX business validation |
| GET | `/api/filing/validate/alc` | ALC business validation |
| POST | `/api/filing/tax/calculate` | Run TAX calculation |
| POST | `/api/filing/alc/allocate` | Run ALC partner allocations |

Legacy aliases: `/upload/cem|mad|cam` → CLM/MDM/ACC.

### Excel templates

| Module | File | Sheets / columns |
|--------|------|------------------|
| CLM | `clm.xlsx` | `Engagement`: clientId, engagementId, projectId, entityGroupId, jobId, **entityName**, taxYear, dueDate, formType, jurisdiction, states |
| MDM | `mdm.xlsx` | `Entity` + `Partners` (ownership must total 100%) |
| ACC | `acc.xlsx` | `TrialBalance`: accountCode, accountName, bookAmount, schedule |

Five demo sets: `testdata/set-01` … `set-05` (`npm run generate:excel`).  
set-01 = compact baseline; set-02…05 = dynamic partners + full trial balance.

Entity **display name** comes from **CLM** (`entityName`). EIN and partner detail come from **MDM**.

### Quality gates

| Gate | Boundary |
|------|----------|
| AQG1 | CLM → MDM |
| AQG2 | MDM/ACC → TAX |
| AQG3 | TAX calculation |
| AQG4 | TAX → ALC → DOC |
| AQG5 | Full business transaction / MeF |

---

## Gateway APIs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Gateway + all six services |
| GET | `/api/architecture` | Services, CT catalog, matrix |
| GET | `/api/contracts` | List / filter contracts |
| GET | `/api/contracts/{id}` | Contract metadata + sample (`CT-00` … `CT-17`) |
| GET | `/openapi.json` | OpenAPI 3.0 (dynamic `servers` for tunnel host) |
| GET | `/api-docs` | Swagger UI |
| GET | `/download/postman-collection` | Postman collection JSON (all APIs) |
| GET | `/download/postman-environment` | Postman environment JSON |
| GET | `/download/postman.zip` | Collection + environment ZIP |

---

## Common service endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness + produced/consumed CT IDs |
| GET | `/contracts` | Produced & consumed lists |
| GET | `/pipeline` | Reachability of consumed producers |
| GET | `/consume/{contractId}` | Pull producer payload |
| GET | `/contracts/ct-XX/...` | Producer payload |

**TAX-only:** `GET|POST /validate`, `POST /calculate`, `GET /tax-computation`  
**ALC-only:** `GET|POST /validate`, `POST /allocate`, `GET /allocations`  
**CLM/MDM/ACC:** `POST /upload`

```http
GET /api/proxy/TAX/health
GET /api/proxy/C/health
GET /api/proxy/MDM/contracts/ct-01/entities
GET /api/proxy/A/contracts/ct-01/entities
GET /api/proxy/TAX/consume/CT-06
```

---

## Contract endpoints (CT-00 … CT-17)

### Downstream

| ID | Producer → Consumer | Gateway path | Purpose |
|----|---------------------|--------------|---------|
| CT-00 | CLM → MDM | `/api/proxy/CLM/contracts/ct-00/engagement-context` | Engagement context |
| CT-01 | MDM → ACC | `/api/proxy/A/contracts/ct-01/entities` | Entities for mapping |
| CT-02 | MDM → TAX | `/api/proxy/A/contracts/ct-02/tax-attributes` | Tax attributes |
| CT-03 | MDM → ALC | `/api/proxy/A/contracts/ct-03/ownership` | Ownership |
| CT-04 | MDM → DOC | `/api/proxy/A/contracts/ct-04/filing-meta` | Filing metadata |
| CT-06 | ACC → TAX | `/api/proxy/B/contracts/ct-06/book-balances` | Book balances |
| CT-07 | ACC → ALC | `/api/proxy/B/contracts/ct-07/capital-map` | Capital map |
| CT-10 | TAX → ALC | `/api/proxy/C/contracts/ct-10/taxable-income` | Taxable income |
| CT-11 | TAX → DOC | `/api/proxy/C/contracts/ct-11/tax-summary` | Tax summary |
| CT-14 | ALC → DOC | `/api/proxy/D/contracts/ct-14/partner-allocations` | K-1 allocations |

### Upstream (reverse)

| ID | Producer → Consumer | Gateway path | Purpose |
|----|---------------------|--------------|---------|
| CT-05 | ACC → MDM | `/api/proxy/B/contracts/ct-05/mapping-gaps` | Mapping gaps |
| CT-08 | TAX → MDM | `/api/proxy/C/contracts/ct-08/attribute-gaps` | Attribute gaps |
| CT-09 | TAX → ACC | `/api/proxy/C/contracts/ct-09/btt-asks` | Book-to-tax asks |
| CT-12 | ALC → MDM | `/api/proxy/D/contracts/ct-12/ownership-issues` | Ownership issues |
| CT-13 | ALC → TAX | `/api/proxy/D/contracts/ct-13/allocation-needs` | Allocation needs |
| CT-15 | DOC → MDM | `/api/proxy/E/contracts/ct-15/entity-print-needs` | Name / EIN |
| CT-16 | DOC → TAX | `/api/proxy/E/contracts/ct-16/tax-line-needs` | Tax lines |
| CT-17 | DOC → ALC | `/api/proxy/E/contracts/ct-17/capital-restatement` | Capital restatement |

### Example — CT-11

```http
GET /api/proxy/C/contracts/ct-11/tax-summary
```

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

---

## Service ports

| Service | Letter | Port | Direct base |
|---------|--------|------|-------------|
| CLM | — | 4101 | `http://127.0.0.1:4101` |
| MDM | A | 4102 | `http://127.0.0.1:4102` |
| ACC | B | 4103 | `http://127.0.0.1:4103` |
| TAX | C | 4104 | `http://127.0.0.1:4104` |
| ALC | D | 4105 | `http://127.0.0.1:4105` |
| DOC | E | 4106 | `http://127.0.0.1:4106` |
| Gateway | — | 4100 | `http://127.0.0.1:4100` |

---

## Errors

| HTTP | When |
|------|------|
| 400 | Bad Excel / missing prerequisites (e.g. MDM before CLM) |
| 404 | Unknown contract or service |
| 422 | TAX/ALC business validation failed |
| 502 | Producer unreachable during `/consume` or `/pipeline` |

---

## Automation

```bash
npm run test:contracts
```

Recommended layers: health → producer contracts → consumer `/consume` → upstream issues → TAX/ALC validation → upload E2E → forms/package.

---

## Related docs

| Document | Content |
|----------|---------|
| [TaxMesh_API_Architecture_and_Developer_Guide.md](TaxMesh_API_Architecture_and_Developer_Guide.md) | Full developer guide |
| [APPLICATION_MANUAL.md](APPLICATION_MANUAL.md) | Install & UI walkthrough |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Architecture article |
