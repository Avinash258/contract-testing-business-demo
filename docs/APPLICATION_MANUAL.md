# TaxMesh Application Manual — Upload-driven data flow

US partnership Form **1065** demo. The SPA focuses on **data flow across workspaces** (contract and flow APIs remain available for automation).

Full API reference: [TaxMesh_API_Architecture_and_Developer_Guide.md](TaxMesh_API_Architecture_and_Developer_Guide.md) · [API.md](API.md)

## Data flow rules

1. **Upload CLM + MDM** → engagement (incl. **entity name**) & partners are available for **ACC** and **TAX**.  
2. **Upload ACC** → ACC joins **CLM + MDM**, then feeds **TAX** and **ALC**.  
3. **TAX + ALC calculate** (business validation) → **DOC** (1065 / K-1 package).

ACC upload automatically runs: **TAX → ALC → DOC**.

**Reset** clears the top banner (engagement, project, entity, EIN, tax year, package) and all module readiness — nothing is left from demo seed.

## Workspaces (microservices)

| Code | Workspace | Port | Role in the flow |
|------|-----------|------|------------------|
| CLM | Client Management | 4101 | Engagement + **entity name** (`clm.xlsx`) |
| MDM | Master Data | 4102 | EIN, partners, ownership (`mdm.xlsx`; needs CLM) |
| ACC | Accounting | 4103 | Trial balance (`acc.xlsx`; needs CLM+MDM) → TAX & ALC |
| TAX | Tax Computation | 4104 | Tax calculation + validation (consumes CLM+MDM+ACC) |
| ALC | Allocations | 4105 | Partner allocations + validation (consumes MDM+ACC+TAX) |
| DOC | Forms & Documents | 4106 | Package from TAX + ALC |
| — | Gateway | 4100 | UI + API orchestration |

Legacy codes CEM/MAD/CAM/TIM/RPAM/FORMS still resolve as aliases.

## UI

Left menu: **Overview** · **CLM / MDM / ACC / TAX / ALC / DOC** · **Form 1065 / K-1** · **API docs**

- CLM / MDM / ACC pages: Excel upload  
- TAX / ALC pages: **Run validation**, **Calculate** / **Allocate**, findings panel  
- Each module side panel shows **downstream / upstream** peers and API URLs  

## Run

```bash
npm install
npm start
```

Open http://127.0.0.1:4100

1. **Reset** (optional) — banner and modules empty  
2. Pick dataset `set-01` … `set-05` → **Load files**  
3. **Upload all 3 & process** (or upload CLM → MDM → ACC in order)  
4. Open **TAX** / **ALC** to review validation; **Form 1065 / K-1** for results  

Excel files: `testdata/set-0N/clm.xlsx`, `mdm.xlsx`, `acc.xlsx`  
Regenerate: `npm run generate:excel`

Downloads from UI: architecture guide (`.docx`), per-set ZIP, all testdata ZIP.

## Key APIs

```http
POST /api/filing/reset
POST /api/filing/upload/clm
POST /api/filing/upload/mdm
POST /api/filing/upload/acc      # also runs TAX → ALC → DOC
POST /api/filing/process-flow
GET  /api/filing/data-flow
GET  /api/filing/validate/tax
GET  /api/filing/validate/alc
POST /api/filing/tax/calculate
POST /api/filing/alc/allocate
GET  /api/filing
GET  /api/flow
GET  /api/proxy/MDM/downstream/TAX
GET  /api/proxy/TAX/upstream/MDM
```

Swagger: http://127.0.0.1:4100/api-docs  

When hosting behind Cloudflare (or any reverse proxy), Swagger **Try it out** uses the same host (`/` server). Restart the tunnel against `http://127.0.0.1:4100` after pulling updates.
