# 05 — Run & Demo Guide

Commands below come from `package.json`, `README.md`, and `docs/APPLICATION_MANUAL.md`.

---

## 1. Prerequisites

| Tool | Required? | Version evidence | Notes |
|------|-----------|------------------|-------|
| Node.js | Yes | Docker uses **20**; README assumes Node available | Local machine may differ |
| npm | Yes | Comes with Node; lockfile v3 | `npm install` |
| Git | Optional | Repo may be cloned | — |
| Docker / Compose | Optional | `Dockerfile`, `docker-compose.yml` | Alternative to local Node |
| Browser | For UI demo | — | http://127.0.0.1:4100 |
| Postman | Optional | `postman/` | Import collection |
| Pact CLI / Broker | **Not found / not required** | — | Custom runner only |
| Java / Maven | **Not found / not required** | — | JS-only demo |

**Env setup (from README):**

| Variable | Purpose | Default |
|----------|---------|---------|
| `PUBLIC_BASE_URL` | Public host for Swagger behind tunnel | unset → request host |
| `GATEWAY_PORT` | Gateway port | `4100` (`contracts.js`) |
| `URL_CLM` / `URL_MDM` / … or legacy `URL_CEM`… | Override service base URLs | `http://127.0.0.1:{port}` |
| Docker compose env | `URL_CEM`…`URL_FORMS` to container hostnames | `docker-compose.yml` |

---

## 2. Exact commands

| Goal | Command | Evidence |
|------|---------|----------|
| Install | `npm install` | `README.md` |
| Start all | `npm start` | `package.json` → `scripts/start-all.js` |
| Start one service | e.g. `npm run start:mdm` | `package.json` |
| Start gateway only | `npm run start:gateway` | `package.json` |
| Run contract tests | `npm run test:contracts` | `package.json` |
| Regenerate Excel | `npm run generate:excel` | `README.md` |
| Regenerate OpenAPI | `npm run generate:openapi` | `package.json` |
| Regenerate Postman | `npm run generate:postman` | `README.md` |
| Regenerate Word guide | `npm run generate:guide` | `README.md` |
| Docker up | `npm run docker:up` or `docker compose up --build` | `README.md` |
| Docker down | `npm run docker:down` | `package.json` |

**Important:** Contract tests need services **already running** (runner uses HTTP `fetch` to ports). Start with `npm start` in one terminal, then `npm run test:contracts` in another.

---

## 3. Where to view results

| Result | Where |
|--------|-------|
| Contract PASS/FAIL | Terminal stdout from `test:contracts` |
| UI filing status | http://127.0.0.1:4100 |
| Swagger | http://127.0.0.1:4100/api-docs |
| OpenAPI JSON | http://127.0.0.1:4100/openapi.json |
| Health mesh | http://127.0.0.1:4100/api/health |
| Contract catalog | http://127.0.0.1:4100/api/contracts |
| Single contract + sample | http://127.0.0.1:4100/api/contracts/CT-02 |
| Flow catalog | http://127.0.0.1:4100/api/flow |
| HTML reports / Allure / Pact Broker UI | **Not found in repo** |

---

## 4. Expected output

### Pass — contract runner

Pattern from `contracts/run-contracts.js`:

```text
PASS  CT-00  CLM→MDM  (downstream)
PASS  CT-01  MDM→ACC  (downstream)
...
PASS  CT-17  DOC→ALC  (reverse)

18/18 contracts passed
```

Exit code: **0**

### Fail — services not running

```text
FAIL  CT-00  CLM→MDM  ...
...
0/18 contracts passed
```

(or mix of FAIL with connection / fetch errors). Exit code: **1**

### Fail — missing key (shape break)

```text
FAIL  CT-02  MDM→TAX  CT-02 missing key "taxAttributes"
...
17/18 contracts passed
```

Exit code: **1**

### UI demo happy path (from APPLICATION_MANUAL)

1. `npm install` → `npm start`
2. Open http://127.0.0.1:4100
3. Reset (optional) → pick `set-01`…`set-05` → Load files
4. Upload all 3 & process (or CLM → MDM → ACC)
5. Review TAX / ALC validation; Form 1065 / K-1 results

---

## 5. Break it on purpose

| Action | File / change | Then | Expected error |
|--------|---------------|------|----------------|
| Break CT-02 shape | In `shared/payloads.js`, delete line/key `taxAttributes` inside `'CT-02'` | Restart services → `npm run test:contracts` | `FAIL  CT-02  MDM→TAX  CT-02 missing key "taxAttributes"` |
| Break contractId | Change `contractId: 'CT-02'` to `'CT-99'` in same payload | Restart → retest | `Expected contractId CT-02, got CT-99` |
| Break HTTP | Stop MDM only (kill port 4102) | Retest | FAIL CT-* produced by MDM (fetch/HTTP error) |
| Fix | Restore `payloads.js` / restart MDM | Retest | `18/18 contracts passed` |

**Do not invent Pact verification errors** — this runner only checks HTTP ok, `contractId`, and top-level required keys.

---

## 6. Troubleshooting

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| All contracts FAIL | Services not started | Run `npm start` first |
| Port in use | Previous Node still running | Stop old processes; free 4100–4106 |
| `Cannot find module` | Deps missing | `npm install` |
| Excel upload rejected | Not `.xlsx` | Use files from `testdata/set-0N/` |
| Swagger Try-it fails behind tunnel | Wrong server URL | Set `PUBLIC_BASE_URL`; restart (`README.md`) |
| Docker services can’t reach peers | Wrong `URL_*` | Use compose file env (`URL_CEM`… containers) |
| Looking for Pact broker UI | Not part of this demo | Use `/api/contracts` + terminal runner |
| `test:contracts` not in CI | No CI config in repo | Run locally; add CI yourself if needed |

---

## Gate 6 summary

| Check | Result |
|-------|--------|
| Commands from package.json / README | Yes |
| Invented Pact/CI commands | Avoided; marked Not found |
| Break-it exercise tied to real assertion | `requiredKeys` / `contractId` in `run-contracts.js` |
