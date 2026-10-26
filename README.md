# TaxMesh — Contract Testing Business Demo

Upload-driven **US partnership Form 1065** demo that matches the taxation microservices case study:

- **6 microservices:** **CLM · MDM · ACC · TAX · ALC · DOC**
- **18 contracts:** CT-00 … CT-17 (**10 downstream** + **8 upstream/reverse**)
- Gateway SPA, filing orchestration, Swagger, Excel demo sets
- Explicit **downstream / upstream** data-flow APIs between modules

Legacy codes (**CEM / MAD / CAM / TIM / RPAM / FORMS**) still work as aliases.

| Workspace | Code | Port |
|-----------|------|------|
| Client Management | **CLM** | 4101 |
| Master Data | **MDM** | 4102 |
| Accounting | **ACC** | 4103 |
| Tax Computation | **TAX** | 4104 |
| Allocations | **ALC** | 4105 |
| Forms & Documents | **DOC** | 4106 |
| Gateway + UI + Swagger | — | **4100** |

Letter aliases: **A=MDM · B=ACC · C=TAX · D=ALC · E=DOC**

## Quick start

```bash
cd C:\Project\ContratTestingBussinessDemo
npm install
npm start
```

| URL | Resource |
|-----|----------|
| http://127.0.0.1:4100 | **TaxMesh UI** |
| http://127.0.0.1:4100/api-docs | **Swagger** (same-origin servers — works behind Cloudflare tunnels) |
| http://127.0.0.1:4100/openapi.json | OpenAPI JSON |
| http://127.0.0.1:4100/api/flow | Downstream + upstream catalog |

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

Legacy upload paths `/upload/cem|mad|cam` still map to CLM/MDM/ACC.

## Docs

| Document | Content |
|----------|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Microservice & contract architecture |
| [docs/API.md](docs/API.md) | API reference (filing + flow + contracts) |
| [docs/APPLICATION_MANUAL.md](docs/APPLICATION_MANUAL.md) | Install & UI walkthrough |
| [docs/TaxMesh_API_Architecture_and_Developer_Guide.md](docs/TaxMesh_API_Architecture_and_Developer_Guide.md) | Full developer guide |
| [CASE_STUDY.md](CASE_STUDY.md) | Case-study brief |
| [postman/](postman/) | Postman collection & environment |
