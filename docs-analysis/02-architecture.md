# 02 — Architecture

> Every box maps to a real folder/file under `contract-testing-business-demo/`.

---

## 1. System context (C4-style)

```mermaid
C4Context
  title TaxMesh system context
  Person(user, "Tax analyst / QA", "Uses browser UI")
  Person(dev, "Developer", "Runs npm scripts")
  System_Boundary(taxmesh, "TaxMesh demo") {
    System(gw, "Gateway :4100", "SPA + proxy + filing")
    System(clm, "CLM :4101", "Client Management")
    System(mdm, "MDM :4102", "Master Data")
    System(acc, "ACC :4103", "Accounting")
    System(tax, "TAX :4104", "Tax Computation")
    System(alc, "ALC :4105", "Allocations")
    System(doc, "DOC :4106", "Forms & Documents")
  }
  Rel(user, gw, "HTTP")
  Rel(dev, gw, "npm start / test:contracts")
  Rel(gw, clm, "proxy / health")
  Rel(gw, mdm, "proxy")
  Rel(gw, acc, "proxy")
  Rel(gw, tax, "proxy")
  Rel(gw, alc, "proxy")
  Rel(gw, doc, "proxy")
```

| Box | Real path |
|-----|-----------|
| Gateway | `gateway/index.js`, `gateway/filingRoutes.js` |
| CLM | `services/cem/index.js` → `createService('CLM')` |
| MDM | `services/mad/index.js` → `createService('MDM')` |
| ACC | `services/cam/index.js` → `createService('ACC')` |
| TAX | `services/tim/index.js` → `createService('TAX')` |
| ALC | `services/rpam/index.js` → `createService('ALC')` |
| DOC | `services/forms-print/index.js` → `createService('DOC')` |
| SPA | `frontend/index.html`, `frontend/app.js`, `frontend/styles.css` |
| Shared catalog | `shared/contracts.js`, `shared/payloads.js` |
| Contract runner | `contracts/run-contracts.js` |

Simpler flowchart (same as `docs/ARCHITECTURE.md`):

```mermaid
flowchart LR
  User[Browser / QA] --> GW[Gateway :4100]
  GW --> CLM[CLM :4101]
  GW --> MDM[MDM :4102]
  GW --> ACC[ACC :4103]
  GW --> TAX[TAX :4104]
  GW --> ALC[ALC :4105]
  GW --> DOC[DOC :4106]
```

---

## 2. Component diagram

```mermaid
flowchart TB
  subgraph Presentation["Presentation"]
    UI["frontend/*"]
  end
  subgraph Edge["Edge"]
    GW["gateway/index.js"]
    FR["gateway/filingRoutes.js"]
  end
  subgraph Domain["Domain services"]
    S["services/*/index.js"]
    CS["shared/createService.js"]
  end
  subgraph ContractStore["Contract storage (in-repo JS)"]
    CAT["shared/contracts.js CONTRACTS"]
    PAY["shared/payloads.js PAYLOADS"]
  end
  subgraph Verify["Verification"]
    RUN["contracts/run-contracts.js"]
  end
  subgraph Data["Demo data"]
    XLS["testdata/set-0N/*.xlsx"]
    STORE["shared/filingStore.js → data/engagement.json"]
  end
  subgraph Ops["Ops"]
    DC["docker-compose.yml"]
    SA["scripts/start-all.js"]
  end
  UI --> GW
  GW --> FR
  GW --> S
  S --> CS
  CS --> CAT
  CS --> PAY
  RUN --> CAT
  RUN --> PAY
  RUN -->|HTTP GET producer paths| S
  FR --> STORE
  FR --> XLS
  SA --> S
  SA --> GW
  DC --> S
  DC --> GW
  Broker["Pact Broker"] -.->|Not found in repo| X
  CI["GitHub Actions / Jenkins"] -.->|Not found in repo| X
```

| Component | Technology | Folder/File |
|-----------|------------|-------------|
| Consumers / Producers | Express microservices | `services/` + `shared/createService.js` |
| Contract catalog | JS arrays/objects | `shared/contracts.js` |
| Sample payloads | JS objects | `shared/payloads.js` |
| Contract storage | **In source code** (not broker) | same files |
| Broker | **Not found** | — |
| CI gate | **Not found** | — |
| Verification runner | Node `fetch` script | `contracts/run-contracts.js` |

---

## 3. Tech stack table

| Layer | Technology | Version | Purpose | Evidence |
|-------|------------|---------|---------|----------|
| Runtime | Node.js | **20** (Docker); local version Not found pinned in README | Run services | `Dockerfile` `FROM node:20-alpine` |
| Package manager | npm | lockfile present | Install deps | `package-lock.json` |
| HTTP API | Express | ^4.21.2 | Microservices + gateway | `package.json` |
| CORS | cors | ^2.8.5 | Cross-origin | `package.json` |
| Uploads | multer | ^2.5.0 | Excel upload | `gateway/filingRoutes.js` |
| Excel | xlsx | ^0.18.5 | Parse/generate sheets | `shared/excelImport.js` |
| OpenAPI UI | swagger-ui-express | ^5.0.1 | Swagger at `/api-docs` | `gateway/index.js` |
| ZIP | archiver | ^5.3.2 | Postman/testdata zips | `gateway/index.js` |
| DOCX gen | docx | ^9.14.0 | Guide generation | `scripts/generate-guide-docx.js` |
| Frontend | Vanilla HTML/CSS/JS | — | SPA | `frontend/` |
| Containers | Docker Compose | compose file v-style | Multi-service | `docker-compose.yml` |
| Contract tool | Custom runner | 1.0.0 app | Shape checks | `contracts/run-contracts.js` |

---

## 4. Dependency table (module → depends on → why)

| Module | Depends on | Why | Evidence |
|--------|------------|-----|----------|
| `services/*/index.js` | `shared/createService.js` | Build Express app | each service file |
| `shared/createService.js` | `contracts.js`, `payloads.js`, `flowApis.js`, `serviceUploads.js`, `serviceValidation.js`, `serviceV2Apis.js` | Routes + payloads | requires at top |
| `shared/flowApis.js` | `contracts.js`, `payloads.js` | Downstream/upstream APIs | requires |
| `contracts/run-contracts.js` | `shared/contracts.js`, `shared/payloads.js` | Verify shapes | requires |
| `gateway/index.js` | `contracts.js`, `payloads.js`, `openapi.js`, `filingRoutes.js`, `flowApis.js` | Proxy + docs + UI | requires |
| `gateway/filingRoutes.js` | `filingEngine.js`, `filingStore.js`, `contracts.js` | Filing orchestration | requires |
| `shared/filingEngine.js` | `filingStore.js`, `payloads.js`, `excelImport.js`, `dataFlow.js`, `businessValidation.js` | Form 1065 journey | requires |
| `frontend/app.js` | Gateway HTTP APIs | UI calls `/api/*` | fetch usage in file |
| `scripts/start-all.js` | child processes of services + gateway | Boot everything | spawn list |
| Docker services | same Node images | Isolated ports | `docker-compose.yml` |

---

## 5. Data / contract flow

```mermaid
sequenceDiagram
  participant Cat as shared/contracts.js
  participant Pay as shared/payloads.js
  participant Prod as Producer service
  participant Cons as Consumer service
  participant Run as run-contracts.js

  Note over Cat,Pay: Contracts are AUTHORIZED in source (not generated by a consumer test framework)
  Cat->>Prod: createService registers GET ct.path
  Pay->>Prod: Response body = PAYLOADS[id] + metadata
  Cons->>Prod: GET /consume/CT-XX or /consume/downstream
  Run->>Prod: GET urlFor(producer, path)
  Run->>Run: assert contractId + requiredKeys
```

| Step | Where | File |
|------|-------|------|
| Contract **defined** | JS catalog | `shared/contracts.js` `CONTRACTS` |
| Shape **defined** | Sample payloads | `shared/payloads.js` `PAYLOADS` |
| Contract **“generated”** | Not generated at runtime from consumer tests — **hand-authored** | Not found: Pact generate step |
| Stored | In git as JS | same files |
| Served | Producer HTTP | `createService.js` `app.get(ct.path, …)` |
| Verified | Runner | `contracts/run-contracts.js` `check` |
| Published to broker | **Not found** | — |

### Contract mesh (downstream solid / upstream dashed)

```mermaid
flowchart LR
  CLM -->|CT-00| MDM
  MDM -->|CT-01| ACC
  MDM -->|CT-02| TAX
  MDM -->|CT-03| ALC
  MDM -->|CT-04| DOC
  ACC -->|CT-06| TAX
  ACC -->|CT-07| ALC
  TAX -->|CT-10| ALC
  TAX -->|CT-11| DOC
  ALC -->|CT-14| DOC
  ACC -.->|CT-05| MDM
  TAX -.->|CT-08| MDM
  TAX -.->|CT-09| ACC
  ALC -.->|CT-12| MDM
  ALC -.->|CT-13| TAX
  DOC -.->|CT-15| MDM
  DOC -.->|CT-16| TAX
  DOC -.->|CT-17| ALC
```

Evidence: rows in `shared/contracts.js` lines ~96–122; diagram also in `docs/ARCHITECTURE.md`.

### Upload-driven filing flow (separate from CT runner)

```mermaid
flowchart LR
  U1[Upload clm.xlsx] --> CLM
  U2[Upload mdm.xlsx] --> MDM
  U3[Upload acc.xlsx] --> ACC
  CLM --> TAX
  MDM --> TAX
  ACC --> TAX
  TAX --> ALC
  ALC --> DOC
```

Evidence: `shared/dataFlow.js` header comments; `README.md` “Data flow”.

---

## 6. Class / module diagram (logical)

```mermaid
classDiagram
  class createService {
    +createService(serviceId)
    +GET /health
    +GET /contracts
    +GET ct.path
    +GET /consume/:id
  }
  class CONTRACTS {
    +id producer consumer direction path title
  }
  class PAYLOADS {
    +CT-00..CT-17 sample bodies
    +requiredKeys(id)
  }
  class run_contracts {
    +check(ct)
    +main()
  }
  class filingEngine {
    +snapshot()
    +runTax()
    +upload handlers via routes
  }
  createService --> CONTRACTS
  createService --> PAYLOADS
  run_contracts --> CONTRACTS
  run_contracts --> PAYLOADS
  filingEngine --> PAYLOADS
```

---

## Gate 3

| Check | Status |
|-------|--------|
| Every diagram box → real folder/file | Done |
| Broker / CI | Marked Not found |
| Contract storage = in-repo JS | Confirmed |
| Uncertain | Exact local Node version outside Docker (README does not pin) |
