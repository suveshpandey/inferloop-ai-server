# InferLoop Server

Backend for **InferLoop AI** — a five-agent, test-driven code-review system for DSA / competitive-programming submissions. The loop generates test cases, runs the code against them in a Vercel sandbox, feeds failing cases back to the Improver, and stops when **measured pass-rate** hits 100% (or stalls). Built with Node.js, Express 5, TypeScript, Prisma, and PostgreSQL. Auth uses Argon2 + JOSE JWTs + DB-backed refresh tokens.

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
| LLM | Provider-swappable via `LLM_PROVIDER` — **Ollama** (`qwen2.5-coder:7b`, local), **Gemini** (`gemini-2.5-flash`, direct), or **Euri** (`api.euron.one` gateway → gpt / gemini / claude / qwen / …). All five agents share one `chatJSON` interface with bounded JSON-validation retries. |
| Code sandbox | Vercel Sandbox (Firecracker microVMs) — runs submitted code against test cases. C++ uses a prebuilt g++ snapshot for fast cold start. |
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
│   ├── schema.prisma          # DB schema (User, RefreshToken, Run, Iteration, TestCase, TestResult, TestSource)
│   └── migrations/            # Generated migration history
├── src/
│   ├── server.ts              # App bootstrap, mounts routers
│   ├── config/
│   │   └── env.ts             # Loads + exposes env vars
│   ├── db/
│   │   ├── client.ts          # Singleton PrismaClient
│   │   ├── runs.ts            # Run/Iteration/TestCase/TestResult persistence (atomic transaction in saveCompletedRun)
│   │   └── test-cases.ts      # TestCase/TestResult repo (userId-scoped CRUD + bulkCreateGenerated + saveTestResults)
│   ├── auth/
│   │   ├── password.ts        # hashPassword / verifyPassword (argon2)
│   │   ├── jwt.ts             # signAccessToken / verifyAccessToken (jose)
│   │   ├── refresh.ts         # issue / find / revoke refresh tokens
│   │   └── middleware.ts      # requireAuth (Bearer token gate)
│   ├── llm/
│   │   ├── index.ts           # Provider dispatcher + chatJSONValidated (chatJSON + Zod + bounded retries)
│   │   ├── ollama.ts          # chatJSON — Ollama HTTP wrapper
│   │   ├── gemini.ts          # chatJSON — Gemini direct wrapper
│   │   └── euri.ts            # chatJSON — Euri (OpenAI-compatible) gateway wrapper
│   ├── sandbox/
│   │   ├── runner.ts          # runCodeBatch (1 sandbox, N inputs — primary API) + runCode wrapper
│   │   └── types.ts           # RunParams / RunResult / ErrorReason (no SDK leakage to callers)
│   ├── services/
│   │   └── run-tests.ts       # runTestsInMemory (pure core for the pipeline) + executeTestsForRun (DB-backed for the route)
│   ├── agents/
│   │   ├── schemas.ts         # Zod schemas for all five agent outputs + FailedCase + TestCaseSchema
│   │   ├── analyzer.ts        # Finds correctness / complexity / edge-case issues against constraints
│   │   ├── critic.ts          # Audits each finding — keep / drop / modify
│   │   ├── improver.ts        # Rewrites code against approved findings + previous failing cases
│   │   ├── evaluator.ts       # Final verdict (runs ONCE at end with measured pass-rate)
│   │   └── test-generator.ts  # 5th agent — drafts ~6 cases probing samples / edges / overflow
│   ├── orchestrator/
│   │   └── pipeline.ts        # reviewLoop — test-driven 5-agent loop with best-iteration tracking
│   ├── scripts/
│   │   ├── build-cpp-snapshot.ts   # One-time: bake node24 + g++ snapshot; paste printed ID into .env
│   │   ├── test-sandbox.ts         # Sandbox runner harness (success / timeout / runtime error)
│   │   ├── test-test-generator.ts  # Test-generator agent harness (Two Sum fixture; shape + coverage)
│   │   ├── test-execute-tests.ts   # 2.2 data-layer harness (seeds a run, asserts pass-rate)
│   │   ├── test-pipeline-e2e.ts    # End-to-end harness — generate → loop → persist → read back
│   │   └── cleanup-sandboxes.ts    # Bulk-delete all sandboxes for the team (reclaim quota)
│   └── api/
│       └── routes/
│           ├── health.ts           # GET /health
│           ├── auth.ts             # /auth/signup, /login, /refresh, /logout, /me, /change-password
│           ├── analyze.ts          # POST /api/analyze
│           ├── critique.ts         # POST /api/critique
│           ├── improve.ts          # POST /api/improve
│           ├── evaluate.ts         # POST /api/evaluate
│           ├── review.ts           # POST /api/review (single-pass, blocking)
│           ├── review-stream.ts    # POST /api/review/stream (SSE; iterative test-driven loop + persistence)
│           ├── runs.ts             # GET /api/runs, GET /api/runs/:id, DELETE /api/runs/:id
│           ├── test-cases.ts       # GET/POST/PATCH/DELETE /api/runs/:runId/test-cases
│           └── execute-tests.ts    # POST /api/runs/:runId/execute-tests
└── .env                       # local secrets (gitignored; see .env.example)
```

---

## Prerequisites

- Node.js 20+
- pnpm 10+
- Docker Desktop running
- One of: **[Ollama](https://ollama.com)** with `qwen2.5-coder:7b` (local), a **Gemini** key, or a **Euri** key (any will do — pick via `LLM_PROVIDER`)
- A **Vercel account + token** for sandboxed test execution (without it, the loop still runs but degrades to test-free reviews)

```bash
# Local dev with Ollama
ollama pull qwen2.5-coder:7b
```

---

## Setup (first time)

```bash
cd inferloop-server
pnpm install
pnpm approve-builds   # approve native build scripts (argon2, prisma engines)
```

Copy `.env.example` → `.env` and fill in the secrets you need. The minimum to boot is `DATABASE_URL` + `JWT_ACCESS_SECRET`; the LLM + sandbox blocks unlock review + test execution respectively.

Start Postgres + run migrations:

```bash
pnpm db:up
pnpm prisma migrate dev
```

(Optional, one-time, for C++ test execution) Build the g++ snapshot and paste the printed ID into `VERCEL_CPP_SNAPSHOT_ID`:

```bash
pnpm tsx src/scripts/build-cpp-snapshot.ts
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
| `pnpm tsx src/scripts/build-cpp-snapshot.ts` | One-time: bake a `node24` + g++ snapshot. Paste the printed `VERCEL_CPP_SNAPSHOT_ID` into `.env`. Required before C++ runs work. |
| `pnpm tsx src/scripts/test-sandbox.ts` | Sandbox runner harness — success / timeout / runtime error against the configured sandbox. |
| `pnpm tsx src/scripts/test-test-generator.ts` | Test-generator agent harness — Two Sum fixture; asserts valid shape + ~6 cases. |
| `pnpm tsx src/scripts/test-execute-tests.ts` | 2.2 data-layer harness — seeds a throwaway run + cases, asserts pass-rate. |
| `pnpm tsx src/scripts/test-pipeline-e2e.ts` | End-to-end harness — generate tests → run loop → persist → read back. Live LLM + sandbox. |
| `pnpm tsx src/scripts/cleanup-sandboxes.ts` | Bulk-delete every sandbox for the team. Reclaims storage + rate-limit headroom after heavy testing. |

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
- **Run** — one row per completed review. Holds the input code, problem statement, `finalCode` (best-iteration code), `terminationReason` (`all-pass` / `stalled` / `no-findings` / `max-iterations` / legacy `converged` / `regressed`), `finalScore`, denormalized `testPassRate`, and `finalEvaluation` (the single end-of-loop verdict as JSON).
- **Iteration** — one row per loop pass. Holds `analyzerOutput`, `criticOutput`, `improverOutput` as JSON columns; `testPassRate` for the trajectory display; nullable `evaluatorOutput`/`overallScore` (populated only on legacy pre-2.4 iterations — the Evaluator now runs once at the end of the loop, not per iteration).
- **TestCase** — a single test for a Run: `name`, `input` (stdin), `expectedOutput`, `source` (`generated` by the test-generator agent, or `manual` user-added). Optional per-case `timeLimitMs` / `memoryLimitMb`.
- **TestResult** — outcome of running one TestCase against the Run's final code: `passed`, `actualOutput`, `stderr`, `exitCode`, `durationMs`, `errorReason` (`ok` / `wrong_answer` / `timeout` / `runtime_error` / `compile_error` / `sandbox_error`). Persistence stores only the **best iteration's** per-case results (M rows, not N×M).

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
| POST | `/api/review/stream` | ✅ | `{ code, language, problemStatement, maxIterations? }` | `text/event-stream` (test-driven loop + persistence; see wire format below) |

`code` is capped at 20,000 chars; `problemStatement` is required (10–10,000 chars); `maxIterations` is clamped to `[1, 5]` (default `3`).

### History

| Method | Path | Auth? | Returns |
|---|---|---|---|
| GET | `/api/runs` | ✅ | `{ runs: RunSummary[] }` — last 30 runs for the caller |
| GET | `/api/runs/:id` | ✅ | `{ run: RunDetail }` — Run + ordered iterations + test cases + final per-case results |
| DELETE | `/api/runs/:id` | ✅ | `204` (cascade deletes iterations + test cases + results) |

Persistence is automatic: when `POST /api/review/stream` finishes, the server writes the Run + Iterations + generated TestCases + best-iteration TestResults in a single Prisma transaction *before* sending the final `done` event. If the DB write fails, the user still receives their review; the error is logged and the run is missing from history.

### Test cases & execution

All scoped to a run the caller owns — a test-case ID or run ID belonging to another user returns `404`, never a leak.

| Method | Path | Auth? | Body | Returns |
|---|---|---|---|---|
| GET | `/api/runs/:runId/test-cases` | ✅ | — | `{ testCases: TestCase[] }` |
| POST | `/api/runs/:runId/test-cases` | ✅ | `{ name, input, expectedOutput, timeLimitMs?, memoryLimitMb? }` | `201 { testCase }` — always stored as `source: 'manual'` |
| PATCH | `/api/runs/:runId/test-cases/:id` | ✅ | any subset of the create body | `200 { testCase }` |
| DELETE | `/api/runs/:runId/test-cases/:id` | ✅ | — | `204` |
| POST | `/api/runs/:runId/execute-tests` | ✅ | — | `{ results, testPassRate, ranAt }` |

`execute-tests` runs every case for the run against its `finalCode` in **one sandbox per call** (the runner batches: one cold start, one compile for C++, N execs — vs. one sandbox per case). It compares stdout (trailing-whitespace-insensitive per line), persists `TestResult` rows + denormalizes `testPassRate` onto the `Run`. Idempotent — re-running replaces prior results. A run with no cases returns `{ results: [], testPassRate: null }`. Sandbox/infra failures return `502` and leave the agent-loop result untouched.

---

## How the pipeline works

```
1. Generate ~6 test cases once (test-generator agent), capped at MAX_GENERATED_CASES.
2. For each iteration (up to maxIterations):
     analyze → critique → improve(previous failures) → runTestsInMemory
   Termination — first match wins:
     - pass-rate == 100              → all-pass         (stop)
     - pass-rate ≤ previous          → stalled          (stop, surface earlier code)
     - tests unavailable + 0 findings → no-findings     (stop)
     - iteration == max               → max-iterations  (stop)
3. Final Evaluator runs ONCE at the end with the measured pass-rate + failing cases.
4. Best-iteration code is surfaced as finalCode (a later regression never wins).
5. Run + iterations + cases + best-iteration results are persisted atomically.
```

**Resilience.** The shared `chatJSONValidated` wrapper retries each agent up to 3 times on JSON-parse or Zod-shape failures (small-model drift is common; temperature > 0 means a re-roll usually succeeds). If the sandbox itself is unavailable (rate limit / transient error), the loop continues test-free and still produces a review.

**Structure preservation.** The Improver prompt forbids removing `main()`, the I/O wrapper, or any function it didn't need to delete — findings target inner algorithms, not the program's surface.

### Streaming wire format

`Content-Type: text/event-stream`. Each event is two lines plus a blank line:

```
event: loop_start
data: {"type":"loop_start","maxIterations":3}

event: tests_generated
data: {"type":"tests_generated","count":6,"cases":[...]}

event: iteration_start
data: {"type":"iteration_start","iteration":1}

event: stage_start / stage_complete   (analyzer → critic → improver)
data: {...}

event: tests_running
data: {"type":"tests_running","iteration":1}

event: test_case_start
data: {"type":"test_case_start","iteration":1,"caseIndex":0,"name":"sample 1"}

event: test_case_complete
data: {"type":"test_case_complete","iteration":1,"result":{...}}

... (per-case start/complete repeats for each generated case) ...

event: iteration_complete
data: {"type":"iteration_complete","iteration":1,"result":{...}}

... (iterations 2..N) ...

event: final_evaluation_starting
data: {"type":"final_evaluation_starting"}

event: final_evaluation
data: {"type":"final_evaluation","result":{...}}

event: loop_complete
data: {"type":"loop_complete","result":{"iterations":[...],"finalCode":"...","terminationReason":"all-pass",...}}

event: done
data: {"type":"done","result":{...},"runId":"clxyz..."}
```

`done` carries the persisted `runId` (or `null` if the save failed) so the client can deep-link to `/history/[id]`. On error the server emits `event: error` with a message, then closes the stream.

Test with curl (use `-N` to disable buffering):

```bash
curl -N -X POST http://localhost:3001/api/review/stream \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"code":"...","language":"python","problemStatement":"...","maxIterations":3}'
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
- ✅ **Phase 5** — Iterative loop (`reviewLoop`)
- ✅ **Phase 6** — History persistence (`Run` + `Iteration`) + `/api/runs` CRUD
- ✅ **Phase 7** — Test-driven review
  - ✅ 2.1 — Sandbox runner (Python + C++ via Vercel Sandbox)
  - ✅ 2.2 — Test-case data layer (repo + execution service + CRUD/execute routes)
  - ✅ 2.3 — Test-generator agent (5th agent)
  - ✅ 2.4 — In-loop execution: pass-rate drives termination, failing cases feed the Improver, Evaluator runs once at the end with measured results
  - ✅ 2.5 — UI surface (test panel, per-case pass/fail, live execution, measured pass-rate row)
- ⏳ **Phase 8** — Multi-file context (import-graph aware, 1-hop)

See `InferLoop_AI_PRD.md` in the repo root for the full spec.
