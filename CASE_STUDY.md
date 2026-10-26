# Case Study: US Partnership Tax Filing + Contract Testing

References:
- `API_Testing_Case_Study_Taxation_Microservices (1).docx` — API journey, async jobs, AQG1–5  
- `NV_Case_Study - AI Drivcen Contract Testing.pdf` — 17-contract microservice mesh  

## Journey under test

**CEM → MAD → CAM → TIM → RPAM → ERE / Forms Print → MeF**

| Module | TaxMesh | Responsibility |
|--------|---------|----------------|
| CEM | Gateway `/api/filing` | Engagement, project, job, correlation ID |
| MAD | Service A | Legal entities, ownership, SALT |
| CAM | Service B | Chart of accounts, mappings → TIM sync |
| TIM | Service C | Book-to-tax, federal/state recalculation |
| RPAM | Service D | Partner capital / allocate & tier |
| Forms Print | Service E | 1065 / K-1 / K-3 package + MeF |

**Contracts:** CT-01…CT-17 (9 downstream + 8 reverse) keep producer/consumer shapes stable across the mesh.

## Demo proof

```bash
npm start
# UI http://127.0.0.1:4100 — Run full journey
# AQG1–AQG5 → passed · status → efiled
npm run test:contracts   # 17/17
```
