# Contract Testing Business Demo

Runnable **case-study application** that matches the Contract Testing Architecture diagram:

- **5 microservices** (A→E): Master Data · Accounting · Tax Engine · Allocations · Forms & Print  
- **17 producer→consumer contracts** (CT-01 … CT-17)  
- **9 downstream** + **8 reverse** edges  
- Gateway UI with live health, edge list, and contract matrix  

## Quick start

```bash
cd C:\Project\ContratTestingBussinessDemo
npm install
npm start
```

Open:

| URL | Resource |
|-----|----------|
| http://127.0.0.1:4100 | **TaxMesh UI** |
| http://127.0.0.1:4100/api-docs | **Swagger** |
| http://127.0.0.1:4100/openapi.json | OpenAPI JSON |

Verify all contracts:

```bash
npm run test:contracts
```

Generate Postman + OpenAPI artifacts:

```bash
npm run generate:postman
npm run generate:openapi
```

Docker:

```bash
docker compose up --build
```

## Ports (6 separate microservices)

| Service | Port |
|---------|------|
| Gateway + UI + Swagger | 4100 |
| **CEM** Client Engagement | 4101 |
| **MAD** Master Data | 4102 |
| **CAM** Accounting | 4103 |
| **TIM** Tax Engine | 4104 |
| **RPAM** Allocations | 4105 |
| **Forms Print** | 4106 |

## Docs & collections

- [CASE_STUDY.md](CASE_STUDY.md) — business case study brief  
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — microservice architecture  
- [docs/API.md](docs/API.md) — **API documentation**  
- [docs/APPLICATION_MANUAL.md](docs/APPLICATION_MANUAL.md) — **application manual**  
- [postman/TaxMesh.postman_collection.json](postman/TaxMesh.postman_collection.json) — **Postman collection**  
- [postman/TaxMesh.postman_environment.json](postman/TaxMesh.postman_environment.json) — Postman environment  
