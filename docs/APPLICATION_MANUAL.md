# TaxMesh Application Manual — Upload-driven data flow

US partnership Form **1065** demo. The SPA focuses on **data flow across microservices** (contract APIs remain available for automation).

Full API reference: [TaxMesh_API_Architecture_and_Developer_Guide.md](TaxMesh_API_Architecture_and_Developer_Guide.md) · [API.md](API.md)

## Data flow rules

1. **Upload CEM + MAD** → engagement (incl. **entity name**) & partners are available for **CAM** and **TIM**.  
2. **Upload CAM** → CAM joins **CEM + MAD**, then feeds **TIM** and **RPAM**.  
3. **TIM + RPAM calculate** (business validation) → **Forms Print** (1065 / K-1 package).

CAM upload automatically runs: **TIM → RPAM → Forms Print**.

**Reset** clears the top banner (engagement, project, entity, EIN, tax year, package) and all module readiness — nothing is left from demo seed.

## Microservices

| Service | Port | Role in the flow |
|---------|------|------------------|
| CEM | 4101 | Engagement + **entity name** (Excel upload) |
| MAD | 4102 | EIN, partners, ownership (Excel upload; needs CEM) |
| CAM | 4103 | Trial balance (Excel upload; needs CEM+MAD) → TIM & RPAM |
| TIM | 4104 | Tax calculation + validation (consumes CEM+MAD+CAM) |
| RPAM | 4105 | Partner allocations + validation (consumes MAD+CAM+TIM) |
| Forms Print | 4106 | Package from TIM + RPAM |
| Gateway | 4100 | UI + API orchestration |

## UI

Left menu: **Overview** · **CEM / MAD / CAM / TIM / RPAM / Forms Print** · **Form 1065 / K-1** · **API docs**

- CEM / MAD / CAM pages: Excel upload  
- TIM / RPAM pages: **Run validation**, **Calculate** / **Allocate**, findings panel  

## Run

```bash
npm install
npm start
```

Open http://127.0.0.1:4100

1. **Reset** (optional) — banner and modules empty  
2. Pick dataset `set-01` … `set-05` → **Load files**  
3. **Upload all 3 & process** (or upload CEM → MAD → CAM in order)  
4. Open **TIM** / **RPAM** to review validation; **Form 1065 / K-1** for results  

Regenerate Excel: `npm run generate:excel`

## Key APIs

```http
POST /api/filing/reset
POST /api/filing/upload/cem
POST /api/filing/upload/mad
POST /api/filing/upload/cam      # also runs TIM → RPAM → Forms
POST /api/filing/process-flow
GET  /api/filing/data-flow
GET  /api/filing/validate/tim
GET  /api/filing/validate/rpam
POST /api/filing/tim/calculate
POST /api/filing/rpam/allocate
GET  /api/filing
```

Swagger: http://127.0.0.1:4100/api-docs
