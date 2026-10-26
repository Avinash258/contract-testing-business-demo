# Case Study: US Partnership Tax Filing + Contract Testing

References:
- `API_Testing_Case_Study_Taxation_Microservices (1).docx` — API journey, async jobs, AQG1–5  
- `NV_Case_Study - AI Drivcen Contract Testing.pdf` — 17-contract microservice mesh  

## Journey under test

**CLM → MDM → ACC → TAX → ALC → DOC / MeF**

| Workspace | Code | TaxMesh | Responsibility |
|-----------|------|---------|----------------|
| Client Management | **CLM** | `:4101` + `/api/filing` | Engagement, project, job, entity name, correlation ID |
| Master Data | **MDM** (A) | `:4102` | Legal entities, ownership, SALT |
| Accounting | **ACC** (B) | `:4103` | Chart of accounts, mappings → TAX sync |
| Tax Computation | **TAX** (C) | `:4104` | Book-to-tax, federal/state recalculation |
| Allocations | **ALC** (D) | `:4105` | Partner capital / allocate & tier |
| Forms & Documents | **DOC** (E) | `:4106` | 1065 / K-1 / K-3 package + MeF |

Legacy case-study labels CEM/MAD/CAM/TIM/RPAM/FORMS map 1:1 to the codes above.

**Contracts:** CT-00…CT-17 (**10 downstream** + **8 upstream/reverse**) keep producer/consumer shapes stable across the mesh.  
**Flow APIs:** `GET /api/flow`, `/api/proxy/{svc}/downstream|{upstream}/{peer}`.

## Demo proof

```bash
npm start
# UI http://127.0.0.1:4100 — upload CLM → MDM → ACC
# AQG1–AQG5 → passed · status → efiled
npm run test:contracts
```
