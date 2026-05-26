# InferLoop Server

Backend for **InferLoop AI** — a multi-agent code-review system that runs Analyzer → Critic → Improver → Evaluator in an iterative loop until the code converges (or the evaluator regresses). Built with Node.js, Express 5, TypeScript, Prisma, and PostgreSQL. Auth uses Argon2 (password hashing) + JOSE JWTs (access tokens) + DB-backed refresh tokens.

---

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js (NodeNext ESM) |
| Language | TypeScript (strict) |
| Web framework | Express 5 |
| Dev runner | tsx (watch mode); production build via `tsc` → `dist/` |
| Database | PostgreSQL 16 (via Docker) |
| ORM | Prisma 6 |
| LLM | Provider-swappable via `LLM_PROVIDER` — Ollama (`qwen2.5-coder:7b`) for dev, Gemini (`gemini-2.5-flash`) for prod |
| Code sandbox | Vercel Sandbox (Firecracker microVMs) — runs submitted code against test cases |
| Password hashing | argon2 (argon2id) |
| JWT lib | jose |
| Validation | Zod |
| Package manager | pnpm |

---

## Project structure

```
inferloop-server/
├── docker-compose.yml         # Postgres container
├── prisma/
│   ├── schema.prisma          # DB schema (User, RefreshToken, Run, Iteration, TestCase, TestResult)
│   └── migrations/            # Generated migration history
├── src/
│   ├── server.ts              # App bootstrap, mounts routers
│   ├── config/
│   │   └── env.ts             # Loads + exposes env vars
│   ├── db/
│   │   ├── client.ts          # Singleton PrismaClient
│   │   ├── runs.ts            # Run/Iteration repo (save, list, get, delete)
│   │   └── test-cases.ts      # TestCase/TestResult repo (CRUD + bulk-generate + save-results), userId-scoped
│   ├── auth/
│   │   ├── password.ts        # hashPassword / verifyPassword (argon2)
│   │   ├── jwt.ts             # signAccessToken / verifyAccessToken (jose)
│   │   ├── refresh.ts         # issue / find / revoke refresh tokens
│   │   └── middleware.ts      # requireAuth (Bearer token gate)
│   ├── llm/
│   │   ├── index.ts           # Provider dispatcher — exports chatJSON, picks Ollama/Gemini from env
│   │   ├── ollama.ts          # chatJSON — Ollama HTTP wrapper
│   │   └── gemini.ts          # chatJSON — Gemini wrapper
│   ├── sandbox/
│   │   ├── runner.ts          # runCode({language,code,stdin,timeoutMs}) → Vercel Sandbox microVM
│   │   └── types.ts           # RunParams / RunResult / ErrorReason (no SDK leakage to callers)
│   ├── services/
│   │   └── run-tests.ts       # executeTestsForRun — runs all of a run's cases, computes pass-rate
│   ├── agents/
│   │   ├── schemas.ts         # Zod schemas for agent outputs
│   │   ├── analyzer.ts        # Analyzer agent (code → findings)
│   │   ├── critic.ts          # Critic agent (findings → reviewed findings)
│   │   ├── improver.ts        # Improver agent (code + reviewed → improved code + change notes)
│   │   └── evaluator.ts       # Evaluator agent (original + improved + reviewed → scores + verdict)
│   ├── orchestrator/
│   │   └── pipeline.ts        # reviewLoop — iterative 4-agent loop with termination logic
│   ├── scripts/
│   │   ├── test-analyzer.ts   # one-off agent tests
│   │   ├── test-critic.ts
│   │   ├── test-improver.ts
│   │   ├── test-evaluator.ts
│   │   ├── test-sandbox.ts        # sandbox runner harness (Python + C++: success/timeout/error)
│   │   ├── test-execute-tests.ts  # test-execution harness (seeds a run, asserts pass-rate)
│   │   └── build-cpp-snapshot.ts  # one-time: bakes a node24 + g++ snapshot for fast C++ cold starts
│   └── api/
│       └── routes/
│           ├── health.ts          # GET /health
│           ├── auth.ts            # /auth/signup, /login, /refresh, /logout, /me, /change-password
│           ├── analyze.ts         # POST /api/analyze
│           ├── critique.ts        # POST /api/critique
│           ├── improve.ts         # POST /api/improve
│           ├── evaluate.ts        # POST /api/evaluate
│           ├── review.ts          # POST /api/review (single-pass, blocking)
│           ├── review-stream.ts   # POST /api/review/stream (SSE, iterative loop + persistence)
│           ├── runs.ts            # GET /api/runs, GET /api/runs/:id, DELETE /api/runs/:id
│           ├── test-cases.ts      # GET/POST/PATCH/DELETE /api/runs/:runId/test-cases
│           └── execute-tests.ts   # POST /api/runs/:runId/execute-tests
└── .env                       # local secrets (gitignored)
```

---

## Prerequisites

- Node.js 20+
- pnpm 10+
- Docker Desktop running
- [Ollama](https://ollama.com) with `qwen2.5-coder:7b` pulled (or set `OLLAMA_MODEL` to whatever you have)

```bash
ollama pull qwen2.5-coder:7b
```

---

## Setup (first time)

```bash
cd inferloop-server
pnpm install
pnpm approve-builds   # approve native build scripts (argon2, prisma engines)
```

Create `.env` in this folder:

```env
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://inferloop:inferloop@localhost:5432/inferloop

JWT_ACCESS_SECRET=dev-access-secret-change-me-please-32chars-min
JWT_ACCESS_TTL=15m

REFRESH_TOKEN_TTL_DAYS=30

# LLM provider: 'ollama' (local dev) or 'gemini' (prod).
LLM_PROVIDER=ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen2.5-coder:7b
# Only needed when LLM_PROVIDER=gemini:
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash

CORS_ORIGIN=http://localhost:3000

# Vercel Sandbox — required to run code against test cases (Phase 2).
# Get the token/team/project from the Vercel dashboard. The C++ snapshot is
# built once via `pnpm tsx src/scripts/build-cpp-snapshot.ts` (see below).
VERCEL_TOKEN=
VERCEL_TEAM_ID=
VERCEL_PROJECT_ID=
VERCEL_CPP_SNAPSHOT_ID=
# Sandbox tuning (optional — these are the defaults):
SANDBOX_TIMEOUT_MS=5000
SANDBOX_MAX_OUTPUT_KB=64
MAX_GENERATED_CASES=8
```

Start Postgres + run migrations:

```bash
pnpm db:up
pnpm prisma migrate dev
```

Run the dev server:

```bash
pnpm dev
```

Server boots at `http://localhost:3001`.

---

## NPM scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start server with `tsx watch` (hot reload) |
| `pnpm typecheck` | Type-check the whole project without emitting (`tsc --noEmit`). Fast pre-push check. |
| `pnpm build` | Production build: `prisma generate` + compile TypeScript to `dist/`. Fails on any type error. |
| `pnpm start` | Run the compiled server from `dist/` (run `pnpm build` first). |
| `pnpm db:up` | Start Postgres container in background |
| `pnpm db:down` | Stop the Postgres container (data preserved) |
| `pnpm db:reset` | Stop + wipe volume + start fresh (⚠️ destroys data) |
| `pnpm prisma migrate dev` | Apply schema changes to local DB |
| `pnpm prisma studio` | Open Prisma Studio (visual DB browser) |
| `pnpm tsx src/scripts/build-cpp-snapshot.ts` | One-time: bake a `node24` + g++ snapshot, then paste the printed `VERCEL_CPP_SNAPSHOT_ID` into `.env`. Required before C++ runs work. |
| `pnpm tsx src/scripts/test-*.ts` | Standalone harnesses (`test-sandbox`, `test-execute-tests`, per-agent). Run individually to verify a layer in isolation. |

---

## Database

Postgres runs in Docker with a named volume `inferloop-pg-data` so data persists across container restarts.

- Host: `localhost`
- Port: `5432`
- User / pass / db: `inferloop` / `inferloop` / `inferloop`

### Schema

```
User ────< RefreshToken
  │
  └────< Run ──┬──< Iteration
               ├──< TestCase ──< TestResult
               └──< TestResult
```

- **User** — auth identity (email, argon2 hash, optional username).
- **RefreshToken** — long-lived session tokens, stored as SHA-256 hashes.
- **Run** — one row per completed review submission (input code, language, problem statement, final code, termination reason, final score). `testPassRate` (0–100, nullable) is denormalized from `TestResult` rows for cheap listing.
- **Iteration** — one row per loop pass inside a Run. Holds the four agent outputs (`analyzerOutput`, `criticOutput`, `improverOutput`, `evaluatorOutput`) as JSON columns plus a denormalized `overallScore` for cheap querying.
- **TestCase** — a single test for a Run: `name`, `input` (stdin), `expectedOutput`, and `source` (`generated` by the test-generator agent, or `manual` user-added). Optional per-case `timeLimitMs` / `memoryLimitMb`.
- **TestResult** — outcome of running one TestCase against the Run's `finalCode` in the sandbox: `passed`, `actualOutput`, `stderr`, `exitCode`, `durationMs`, `errorReason` (`ok` / `wrong_answer` / `timeout` / `runtime_error` / `compile_error` / `sandbox_error`). Re-running execution replaces a Run's results.

Both `RefreshToken` and `Run` cascade-delete with the User. `Iteration`, `TestCase`, and `TestResult` cascade with their `Run`; `TestResult` also cascades with its `TestCase`.

To inspect data:

```bash
pnpm prisma studio
```

To reset everything:

```bash
pnpm db:reset
pnpm prisma migrate dev
```

---

## API endpoints

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness + DB reachability probe |

### Auth

| Method | Path | Auth? | Body | Returns |
|---|---|---|---|---|
| POST | `/auth/signup` | — | `{ email, password, username? }` | `201 { email, accessToken, refreshToken }` |
| POST | `/auth/login` | — | `{ email, password }` | `200 { email, accessToken, refreshToken }` |
| POST | `/auth/refresh` | — | `{ refreshToken }` | `200 { accessToken }` |
| POST | `/auth/logout` | — | `{ refreshToken }` | `204` |
| GET | `/auth/me` | ✅ | — | `200 { id, email, username, createdAt }` |
| POST | `/auth/change-password` | ✅ | `{ currentPassword, newPassword }` | `204` |

Notes:
- Access tokens: short-lived JWTs (15 min), sent as `Authorization: Bearer <token>`.
- Refresh tokens: 30-day random tokens, DB-stored as SHA-256 hashes only.
- `/change-password` enforces ≥8 chars and that the new password differs from the current one.

### Individual agents

| Method | Path | Auth? | Body | Returns |
|---|---|---|---|---|
| POST | `/api/analyze` | ✅ | `{ code, language, problemStatement }` | `{ findings[], summary }` |
| POST | `/api/critique` | ✅ | `{ code, language, problemStatement, findings }` | `{ reviewedFindings[], summary }` |
| POST | `/api/improve` | ✅ | `{ code, language, problemStatement, reviewed }` | `{ improvedCode, changeNotes[], summary }` |
| POST | `/api/evaluate` | ✅ | `{ originalCode, improvedCode, language, problemStatement, reviewed }` | `{ verdict, scores, rationale, unaddressedFindings? }` |

### Review (full pipeline)

| Method | Path | Auth? | Body | Returns |
|---|---|---|---|---|
| POST | `/api/review` | ✅ | `{ code, language, problemStatement }` | `{ findings, reviewed, improved, evaluation }` (single pass, blocking) |
| POST | `/api/review/stream` | ✅ | `{ code, language, problemStatement, maxIterations? }` | `text/event-stream` (iterative loop, see below) |

`code` is capped at 20,000 chars; `problemStatement` is required (10–10,000 chars) — every agent reasons against it; `maxIterations` is clamped to `[1, 5]` (default `3`).

### History

| Method | Path | Auth? | Returns |
|---|---|---|---|
| GET | `/api/runs` | ✅ | `{ runs: RunSummary[] }` — last 30 runs for the caller |
| GET | `/api/runs/:id` | ✅ | `{ run: RunDetail }` — full payload with ordered iterations |
| DELETE | `/api/runs/:id` | ✅ | `204` (cascade deletes iterations) |

Persistence is automatic: when `POST /api/review/stream` finishes, the server writes the `Run` + all its `Iteration` rows in a single Prisma transaction *before* sending the final `done` event. If the DB write fails, the user still receives their review result; the error is logged and the run is simply missing from history.

### Test cases & execution (Phase 2)

All scoped to a run the caller owns — a test-case ID or run ID belonging to another user returns `404`, never a leak.

| Method | Path | Auth? | Body | Returns |
|---|---|---|---|---|
| GET | `/api/runs/:runId/test-cases` | ✅ | — | `{ testCases: TestCase[] }` |
| POST | `/api/runs/:runId/test-cases` | ✅ | `{ name, input, expectedOutput, timeLimitMs?, memoryLimitMb? }` | `201 { testCase }` — always stored as `source: 'manual'` |
| PATCH | `/api/runs/:runId/test-cases/:id` | ✅ | any subset of the create body | `200 { testCase }` |
| DELETE | `/api/runs/:runId/test-cases/:id` | ✅ | — | `204` |
| POST | `/api/runs/:runId/execute-tests` | ✅ | — | `{ results, testPassRate, ranAt }` |

`execute-tests` runs every case for the run against its `finalCode` in the sandbox (≤3 in parallel), compares stdout (trailing-whitespace-insensitive per line), and persists `TestResult` rows + denormalizes `testPassRate` onto the `Run`. It's idempotent — re-running replaces prior results. A run with no cases returns `{ results: [], testPassRate: null }`. Sandbox/infra failures return `502` and leave the agent-loop result untouched.

> **Note:** test cases are not yet auto-generated by the pipeline — that lands in Phase 2.3/2.4 (the test-generator agent + in-loop execution). Today these endpoints back manual cases and on-demand execution.

---

## How the pipeline works

1. Route validates the request body with Zod.
2. `reviewLoop(code, language, maxIterations, onProgress)` runs up to `maxIterations` passes through `reviewOnce`.
3. Each pass calls Analyzer → Critic → Improver → Evaluator. Outputs are validated against `src/agents/schemas.ts`.
4. The improver's output becomes the input for the next iteration.
5. The loop terminates when one of these fires (in priority order):
   - **`no-findings`** — analyzer returned `findings: []`.
   - **`regressed`** — evaluator verdict is `regressed` (improver made things worse → roll back to prior input).
   - **`converged`** — evaluator verdict is `unchanged` (no more improvements possible).
   - **`max-iterations`** — hit the cap.
6. `finalCode` is the last iteration's `improvedCode` for `converged`/`max-iterations`; for `regressed`/`no-findings` it's the prior iteration's input (skip the regression/no-op).

### Streaming wire format

`Content-Type: text/event-stream`. Each event is two lines plus a blank line:

```
event: loop_start
data: {"type":"loop_start","maxIterations":3}

event: iteration_start
data: {"type":"iteration_start","iteration":1}

event: stage_start
data: {"type":"stage_start","iteration":1,"stage":"analyzer"}

event: stage_complete
data: {"type":"stage_complete","iteration":1,"stage":"analyzer","result":{...}}

... critic, improver, evaluator ...

event: iteration_complete
data: {"type":"iteration_complete","iteration":1,"result":{...}}

... (iterations 2..N) ...

event: loop_complete
data: {"type":"loop_complete","result":{"iterations":[...],"finalCode":"...","terminationReason":"converged"}}

event: done
data: {"type":"done","result":{...},"runId":"clxyz..."}
```

`done` carries the persisted `runId` (or `null` if the save failed) so the client can deep-link to `/history/[id]`. On error the server emits `event: error` with a message, then closes the stream.

Test with curl (use `-N` to disable buffering):

```bash
curl -N -X POST http://localhost:3001/api/review/stream \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"code":"function add(a,b){return a-b}","language":"javascript","maxIterations":3}'
```

---

## Auth model (how it works)

1. **Signup / login** → server returns `accessToken` (JWT) + `refreshToken` (random 48 bytes).
2. Client sends `accessToken` on every API request. Server verifies signature only (no DB hit).
3. When the access token expires (15 min), client calls `/auth/refresh` to get a new one. The refresh token itself is reused.
4. **Logout** → client calls `/auth/logout`; server marks the refresh token revoked.

Access tokens are stateless (fast, can't be revoked). Refresh tokens are stateful (slower, *can* be revoked). Combined, you get fast per-request auth + the ability to log out.

---

## Roadmap

- ✅ **Phase 0** — Server + DB + health check
- ✅ **Phase 1** — Auth (signup / login / refresh / logout / me / change-password)
- ✅ **Phase 2** — Ollama client + Analyzer agent
- ✅ **Phase 3** — Critic / Improver / Evaluator agents
- ✅ **Phase 4** — Orchestrator (single-pass) + per-stage SSE streaming
- ✅ **Phase 5** — Iterative loop (`reviewLoop`) with convergence / regression / no-findings termination
- ✅ **Phase 6** — History persistence (`Run` + `Iteration`) + `/api/runs` CRUD
- ⏳ **Phase 7** — Test-grounded review (run code + tests in a sandbox; pass-rate drives the loop). In progress:
  - ✅ 2.1 — Sandbox runner (`runCode`) for Python + C++ (Vercel Sandbox; C++ via prebuilt g++ snapshot)
  - ✅ 2.2 — Test-case data layer (repo + execution service + CRUD/execute routes)
  - ⏳ 2.3 — Test-generator agent (5th agent)
  - ⏳ 2.4 — In-loop execution: pass-rate as the termination signal, failed cases fed back to the Improver
  - ⏳ 2.5 — UI surface (test panel, per-case pass/fail, measured pass-rate row)
- ⏳ **Phase 8** — Multi-file context (import-graph aware, 1-hop)

See `InferLoop_AI_PRD.md` in the repo root for the full spec.
