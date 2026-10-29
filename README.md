# ForgeSpec

A "GitHub for Bill of Materials": version-controlled BOMs, distributor spec import, and a rule engine
that flags electrical and physical mismatches before parts are bought. Built from the ForgeSpec PRD and
Design Information Architecture.

```
forgespec/
├── backend/             # Section 1: REST API (Node + TypeScript + Express + PostgreSQL)
├── frontend/            # Section 2: React UI (homepage) + typed API client
└── docker-compose.yml   # PostgreSQL (and optionally the API)
```

---

## 1. Backend (`backend/`)

### Run it

```bash
docker compose up -d postgres          # PostgreSQL 16 on :5432
cd backend
cp .env.example .env                   # set JWT_SECRET
npm install
npm run dev                            # migrates on start, API on http://localhost:4000/api/v1
npm test                               # 40 tests, in-memory Postgres emulator, no DB needed
TEST_DATABASE_URL=postgres://forgespec:forgespec@localhost:5432/forgespec npm test   # same suite on real PostgreSQL
```

`DISTRIBUTOR_PROVIDER=mock` (default) serves a built-in 10-part catalogue so everything works offline.
Set it to `nexar` plus `NEXAR_CLIENT_ID` / `NEXAR_CLIENT_SECRET` for Octopart.

### Architecture (maps to the component diagram)

It is a **modular monolith**: one deployable, with each diagram component as an isolated module under
`src/modules/`. The boundaries match the diagram, so any module can be split into a service later.

| Diagram component | Where | Notes |
|---|---|---|
| API Gateway (JWT & RBAC) | `src/middleware/auth.ts`, `src/app.ts` | JWT check, then per-project role check. Non-members get 404, not 403. |
| Project Service (BOM CRUD) | `modules/projects`, `modules/bom`, `modules/team`, `modules/subassemblies`, `modules/backup` | Only module that writes BOM rows. |
| Rule Engine | `modules/rules` | `expression.ts` (safe formula language, no `eval`), `engine.ts` (pure), `prebuilt.ts`, `service.ts` (persist + report). |
| Version Control | `modules/versions` | Immutable snapshots; `diff.ts` is pure. |
| Export Service | `modules/export` | Generate (CSV/PDF → object storage with TTL), then download. |
| Distributor Adapter | `modules/distributor` | Cache, rate limit, error mapping, normalisation. `mock.ts` + `nexar.ts`. |
| Notification Service | `modules/notifications` | In-app rows + email through a `Mailer` interface. |
| PostgreSQL / Object Storage | `src/db/`, `src/storage/` | Schema in `db/schema.ts`; local-disk storage behind an interface (swap for S3/MinIO). |

The unit parser lives in `modules/components/units.ts` + `specs.ts` (`"100mA"` → `0.1 A`, ranges, `LxWxH`).

### Endpoints (`/api/v1`)

| Group (nav menu) | Endpoints | Who |
|---|---|---|
| Authentication | `POST /auth/register` `/auth/login` `/auth/refresh` `/auth/logout` | public |
| Settings › Profile | `GET/PUT /profile` | user |
| Component Library | `GET /components/search` `GET /components/:id` `POST /components/parse` | **guest OK** |
| Custom Part Creator | `POST /components` `PUT /components/:id` `PUT /components/:id/specs/:key` `DELETE /components/:id` | user (own parts) |
| Dashboard | `GET/POST /projects` `GET/PUT/DELETE /projects/:id` `GET /projects/templates` `POST /projects/:id/template` | member |
| Workspace › BOM | `GET/POST /projects/:id/components` `PATCH …/bulk` `PATCH/DELETE …/:itemId` `PUT/DELETE …/:itemId/specs/:key` | viewer reads, editor writes |
| Workspace › Versions | `GET/POST /projects/:id/versions` `GET …/compare?from=&to=` (`working` = uncommitted) | viewer / editor |
| Workspace › Compatibility | `GET …/compatibility/report` `POST …/compatibility/evaluate` | viewer / editor |
| Rule Engine | `GET /rules/prebuilt` `GET /rules/attributes` `GET/POST/PUT/DELETE /projects/:id/rules/custom` `POST …/validate` | viewer / editor |
| Workspace › Sub-assemblies | `GET/DELETE /sub-assemblies` `POST /projects/:id/sub-assemblies` `POST …/:sid/import` | editor |
| Workspace › Export | `POST /projects/:id/exports` `GET /exports/:id/download` | viewer+ |
| Settings › Team | `GET/POST /projects/:id/members` `PATCH/DELETE …/:uid` | admin (viewer can leave) |
| Settings › Audit / Backup | `GET /projects/:id/audit-log` `…/backups` (+ `/:bid/restore`) | admin |
| Notifications | `GET /notifications` `…/unread-count` `PATCH …/:id/read` `POST …/read-all` | user |

Errors always look like `{ "error": { "code", "message", "details?" } }`.

### Design decisions worth knowing

- **Rails.** The BOM has no netlist, so a 5 V regulator would otherwise be checked against a 3.3 V sensor on a
  different supply. Each BOM line has an optional `rail` label; built-in electrical rules only compare parts on
  the same rail (empty = default rail).
- **Missing data never fails a rule.** A check with absent attributes is reported as `skipped`, not `failed`.
- **Rule kinds:** `single` (one part), `pair` (every matching pair), `aggregate` (e.g. `sum(b.current_max * b.quantity) <= a.output_current_max`).
- **Overrides are per BOM line** for distributor parts (they are shared, read-only). Custom parts are private to
  their owner and editable; changing one re-evaluates every project that uses it.
- **Removing a part is a soft delete** (`status: removed`) so history and "include removed" exports work;
  `?hard=true` deletes the row.
- **Notifications:** teammates (not the actor) hear about BOM changes; *everyone* hears about newly introduced
  critical errors. An unchanged failure does not re-notify.

---

## 2. Frontend (`frontend/`)

React + Vite + TypeScript, in two layers: the API client (`src/api`, `src/lib`, no UI) and the interface (`src/ui`).
So far only the **homepage** is built: header, search-first hero with live guest search, three value cards, footer, and
a log in / sign up dialog.

### Run it

```bash
# terminal 1: API without Docker (in-memory database, sample parts: STM32F407, LM7805, ESP32...)
cd backend && npm run dev:mem
# terminal 2: UI on http://localhost:5173 (Vite proxies /api to :4000)
cd frontend && npm run dev
```

`npm test` (UI tests with a faked API), `npm run build`, `npm run typecheck`.

### UI notes

- Text only, no emoji. Icons are three small inline SVGs (cloud, shield, branch), flat blue.
- Palette follows the brief (`src/ui/styles.css` tokens): grey page, white cards, blue accent, red/amber/green status.
- Search needs no login. Guests are only sent to the log in dialog when they try to write (add a part, create a custom part, run checks).
- Homepage copy differs from the brief in one place: the guest hint says guests can search and view technical
  details, and that logging in is needed for compatibility checks. The API requires a project to run checks (PRD
  feature list: checks need login), so the brief's "run basic compatibility checks for free" would not be true.
- "Documentation" and "Contact Us" footer links are placeholders (`#documentation`, `#contact`).
- After login the header shows the user's name; Dashboard / Workspace pages are not built yet, so "Add to Project" is disabled once signed in.

### API client

The UI never touches `fetch`, tokens, or response shapes directly.

```ts
import { createForgeSpecApi, BrowserTokenStore, ApiError } from './src';

const api = createForgeSpecApi({
  baseUrl: 'http://localhost:4000/api/v1',
  tokens: new BrowserTokenStore(),          // localStorage, falls back to memory
  onSessionExpired: () => { /* route to login */ },
});

await api.auth.login({ email, password });
const { items, totals } = await api.bom.list(projectId);   // each row has .compatibility.issues
```

- `src/api/endpoints.ts`: one function per backend route, grouped like the nav menu (`auth`, `projects`, `bom`, `library`, `rules`, `versions`, `subAssemblies`, `exports`, `team`, `audit`, `backups`, `notifications`).
- `src/api/types.ts`: DTO types mirroring the backend.
- `src/lib/http.ts`: auth header, **silent single-flight token refresh + retry**, `ApiError` (with `.fieldErrors` for 422s), file download.
- `backend/tests/client-contract.test.ts` runs this client against the real HTTP server, so API drift breaks a test instead of the browser.


---

## PRD coverage

| Status | Features |
|---|---|
| **Built** | Auth & guest mode · API-driven import · Rule engine (pre-built + custom) · Unit parser + override · Version history & diff · Custom part creator · Compatibility report & live validation · Dashboard metrics · Role-based access · Bulk edit · Search & parametric filtering · Project templates · Audit log · Notifications · Backup & restore · CSV/PDF export · Sub-assemblies · Supply-chain risk flag |
| **UI-only (next step)** | Dark mode & accessibility themes · Mobile responsive · Keyboard shortcuts |
| **Not built** | API webhooks (Slack/Jira) · Community ratings |

### Known gaps and assumptions

- **Nexar provider is untested against the live API** (no credentials here). Verify the GraphQL query before relying on it. The mock provider is what the tests use.
- **Email is a console stub** (`ConsoleMailer`). Implement `Mailer` for SMTP/a provider.
- **Inviting a member requires an existing account**; there is no pending-invite flow.
- **Roles are viewer/editor/admin** as in US-10. The feature table also mentions "Approve Changes", which has no approval workflow here.
- **Not a microservice split.** Modules follow the diagram's boundaries but run in one process.
- **Seeded data:** no global project templates; templates are saved by users from their own projects.
- The IA doc cites US-16 (audit log) and US-17 (backup), which are not in the PRD's user-story table; they are implemented from the feature list.
- Tests ran on an in-memory Postgres emulator. The SQL has **not yet been run against a real PostgreSQL** (Docker was not running when this was built). Run the `TEST_DATABASE_URL` command above once.
