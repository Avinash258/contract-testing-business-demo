# TaxMesh — Contract Testing Business Demo

Upload-driven **US partnership Form 1065** demo that matches the taxation microservices case study:

- **6 microservices:** **CLM · MDM · ACC · TAX · ALC · DOC**
- **18 contracts:** CT-00 … CT-17 (**10 downstream** + **8 upstream/reverse**)
- Gateway SPA, filing orchestration, Swagger, Excel demo sets
- Explicit **downstream / upstream** data-flow APIs between modules

Legacy codes (**CEM / MAD / CAM / TIM / RPAM / FORMS**) still work as aliases.

| Workspace | Code | Port (this V2 copy) | Main (unchanged) |
|-----------|------|---------------------|------------------|
| Client Management | **CLM** | 4201 | 4101 |
| Master Data | **MDM** | 4202 | 4102 |
| Accounting | **ACC** | 4203 | 4103 |
| Tax Computation | **TAX** | 4204 | 4104 |
| Allocations | **ALC** | 4205 | 4105 |
| Forms & Documents | **DOC** | 4206 | 4106 |
| Gateway + UI + Swagger | — | **4200** | **4100** |

Run **main** and **V2 side by side**: leave main on `:4100`, start this folder with `npm start` → UI at http://127.0.0.1:4200.

Letter aliases: **A=MDM · B=ACC · C=TAX · D=ALC · E=DOC**

---

## Release notes

### v2 — branch `v2` (current)

**Focus:** richer **CLM** (Client Management) and **MDM** / MAD (Master Data) APIs, documented in Swagger and Postman.

#### Added

| Area | Change |
|------|--------|
| **CLM v2 APIs** | `GET /v2/engagement`, `GET /v2/status`, `PATCH /v2/engagement` |
| **MDM v2 APIs** | `GET /v2/entity`, `GET /v2/partners`, `GET /v2/ownership`, `GET /v2/status` |
| **Implementation** | New module `shared/serviceV2Apis.js`, wired from `shared/createService.js` |
| **Swagger / OpenAPI** | Tag **API v2**; paths under `/api/proxy/CLM/v2/*` and `/api/proxy/MDM/v2/*` |
| **Postman** | Collection regenerated with CLM/MDM v2 requests (`npm run generate:postman`) |
| **Docs** | This README updated with v2 endpoint list |

#### Behavior notes

- Responses include `"apiVersion": 2`.
- `PATCH /v2/engagement` can update `entityName`, `taxYear`, `dueDate`, `formType`, `jurisdiction`, `states` after a CLM Excel upload.
- `GET /v2/ownership` returns ownership totals and whether they equal **100%**.
- Gateway proxy works the same: `/api/proxy/CLM/v2/...` and `/api/proxy/MDM/v2/...` (legacy `/api/proxy/CEM/...` and `/api/proxy/MAD/...` still resolve to CLM/MDM).
- v1 routes (`/health`, `/contracts`, `/upload`, CT produce/consume, flow APIs) are **unchanged**.

#### Try it

```http
GET   http://127.0.0.1:4200/api/proxy/CLM/v2/status
GET   http://127.0.0.1:4200/api/proxy/CLM/v2/engagement
PATCH http://127.0.0.1:4200/api/proxy/CLM/v2/engagement
GET   http://127.0.0.1:4200/api/proxy/MDM/v2/entity
GET   http://127.0.0.1:4200/api/proxy/MDM/v2/partners
GET   http://127.0.0.1:4200/api/proxy/MDM/v2/ownership
GET   http://127.0.0.1:4200/api/proxy/MDM/v2/status
```

Swagger: http://127.0.0.1:4200/api-docs → filter tag **API v2**.

```bash
git checkout v2
npm start
```

### Earlier on `main` (baseline)

- Workspace codes remapped: **CEM→CLM, MAD→MDM, CAM→ACC, TIM→TAX, RPAM→ALC, FORMS→DOC** (legacy aliases kept).
- Testdata files renamed to `clm.xlsx` / `mdm.xlsx` / `acc.xlsx`.
- Downstream / upstream data-flow APIs (`/api/flow`, `/downstream/{peer}`, `/upstream/{peer}`).
- TAX / ALC business validation + calculate/allocate.
- Tunnel-safe Swagger (same-origin server `/`).
- Postman ZIP download from the UI (`/download/postman.zip`).
- Soft teal UI theme (main). **V2 UI uses a light blue theme.**

---

## Quick start

```bash
cd C:\AI-Project\ContratTestingBussinessDemoV2
npm install
npm start
```

| URL | Resource |
|-----|----------|
| http://127.0.0.1:4200 | **TaxMesh UI (V2)** |
| http://127.0.0.1:4200/api-docs | **Swagger** (same-origin servers — works behind Cloudflare tunnels) |
| http://127.0.0.1:4200/openapi.json | OpenAPI JSON |
| http://127.0.0.1:4200/api/flow | Downstream + upstream catalog |
| http://127.0.0.1:4200/download/postman.zip | **Postman collection + environment** |

```bash
npm run test:contracts
npm run generate:excel      # regenerates testdata/set-0N/{clm,mdm,acc}.xlsx
npm run generate:openapi
npm run generate:postman
npm run generate:guide      # regenerates Word guide from MD
```

Docker:

```bash
docker compose up --build
```

Optional public URL for Swagger / OpenAPI:

```bash
set PUBLIC_BASE_URL=https://your-host.trycloudflare.com
npm start
```

## Data flow

1. **Upload CLM + MDM** (`clm.xlsx`, `mdm.xlsx`) → consumed by ACC and TAX  
2. **Upload ACC** (`acc.xlsx`) → joins CLM+MDM, then runs **TAX → ALC → DOC**  
3. **Upstream** APIs carry reverse asks (e.g. TAX → MDM via CT-08)

Demo Excel lives under `testdata/set-01` … `set-05` (`clm.xlsx` / `mdm.xlsx` / `acc.xlsx`).

## Key APIs

```http
GET  /api/flow
GET  /api/flow/downstream/MDM/TAX
GET  /api/flow/upstream/TAX/MDM
GET  /api/proxy/MDM/downstream/TAX
GET  /api/proxy/TAX/consume/downstream
POST /api/filing/upload/clm
POST /api/filing/upload/mdm
POST /api/filing/upload/acc
GET  /api/filing/validate/tax
POST /api/filing/tax/calculate
GET  /api/filing/validate/alc
POST /api/filing/alc/allocate
```

Legacy upload paths `/upload/cem|mad|cam` still map to CLM/MDM/ACC. See **Release notes → v2** for CLM/MDM `/v2/*` APIs.

## Docs

| Document | Content |
|----------|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Microservice & contract architecture |
| [docs/API.md](docs/API.md) | API reference (filing + flow + contracts) |
| [docs/APPLICATION_MANUAL.md](docs/APPLICATION_MANUAL.md) | Install & UI walkthrough |
| [docs/TaxMesh_API_Architecture_and_Developer_Guide.md](docs/TaxMesh_API_Architecture_and_Developer_Guide.md) | Full developer guide |
| [CASE_STUDY.md](CASE_STUDY.md) | Case-study brief |
| [postman/](postman/) | Postman collection & environment |
