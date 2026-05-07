# InferLoop Server

Backend for **InferLoop AI** — a multi-agent code-analysis system. Built with Node.js, Express 5, TypeScript, Prisma, and PostgreSQL. Auth uses Argon2 (password hashing) + JOSE JWTs (access tokens) + DB-backed refresh tokens.

---

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js (NodeNext ESM) |
| Language | TypeScript (strict) |
| Web framework | Express 5 |
| Dev runner | tsx (watch mode, no separate build) |
| Database | PostgreSQL 16 (via Docker) |
| ORM | Prisma 6 |
| Password hashing | argon2 (argon2id) |
| JWT lib | jose |
| Package manager | pnpm |

---

## Project structure

```
inferloop-server/
├── docker-compose.yml         # Postgres container
├── prisma/
│   ├── schema.prisma          # DB schema (User, RefreshToken)
│   └── migrations/            # Generated migration history
├── src/
│   ├── server.ts              # App bootstrap, mounts routers
│   ├── config/
│   │   └── env.ts             # Loads + exposes env vars
│   ├── db/
│   │   └── client.ts          # Singleton PrismaClient
│   ├── auth/
│   │   ├── password.ts        # hashPassword / verifyPassword (argon2)
│   │   ├── jwt.ts             # signAccessToken / verifyAccessToken (jose)
│   │   ├── refresh.ts         # issue / find / revoke refresh tokens
│   │   └── middleware.ts      # requireAuth (Bearer token gate)
│   ├── llm/
│   │   └── ollama.ts          # chatJSON — Ollama HTTP wrapper
│   ├── agents/
│   │   ├── schemas.ts         # Zod schemas for agent outputs
│   │   ├── analyzer.ts        # Analyzer agent (code → findings)
│   │   ├── critic.ts          # Critic agent (findings → reviewed findings)
│   │   ├── improver.ts        # Improver agent (code + reviewed → improved code + change notes)
│   │   └── evaluator.ts       # Evaluator agent (original + improved + reviewed → scores + verdict)
│   ├── orchestrator/
│   │   └── pipeline.ts        # review(code, language) — runs all 4 agents in sequence
│   ├── scripts/
│   │   ├── test-analyzer.ts   # one-off: Analyzer
│   │   ├── test-critic.ts     # one-off: Analyzer → Critic
│   │   ├── test-improver.ts   # one-off: Analyzer → Critic → Improver
│   │   └── test-evaluator.ts  # one-off: full Analyzer → Critic → Improver → Evaluator chain
│   └── api/
│       └── routes/
│           ├── health.ts      # GET /health  → liveness + DB ping
│           ├── auth.ts        # /auth/signup, /login, /refresh, /logout, /me
│           ├── analyze.ts     # POST /api/analyze  (Analyzer agent)
│           ├── critique.ts    # POST /api/critique (Critic agent)
│           ├── improve.ts     # POST /api/improve  (Improver agent)
│           ├── evaluate.ts    # POST /api/evaluate (Evaluator agent)
│           └── review.ts      # POST /api/review   (full orchestrated pipeline)
└── .env                       # local secrets (gitignored)
```

---

## Prerequisites

- Node.js 20+
- pnpm 10+
- Docker Desktop running
- (optional) Ollama with `qwen2.5-coder:7b` pulled — needed once we wire up agents in Phase 2

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
| `pnpm db:up` | Start Postgres container in background |
| `pnpm db:down` | Stop the Postgres container (data preserved) |
| `pnpm db:reset` | Stop + wipe volume + start fresh (⚠️ destroys data) |
| `pnpm prisma migrate dev` | Apply schema changes to local DB |
| `pnpm prisma studio` | Open Prisma Studio (visual DB browser) |

---

## Database

Postgres runs in Docker with a named volume `inferloop-pg-data` so data persists across container restarts.

- Host: `localhost`
- Port: `5432`
- User / pass / db: `inferloop` / `inferloop` / `inferloop`

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

```bash
curl http://localhost:3001/health
# → { "status": "ok", "db": "reachable" }
```

### Auth

| Method | Path | Auth? | Body | Returns |
|---|---|---|---|---|
| POST | `/auth/signup` | — | `{ email, password, username? }` | `201 { email, accessToken, refreshToken }` |
| POST | `/auth/login` | — | `{ email, password }` | `200 { email, accessToken, refreshToken }` |
| POST | `/auth/refresh` | — | `{ refreshToken }` | `200 { accessToken }` |
| POST | `/auth/logout` | — | `{ refreshToken }` | `204` (no body) |
| GET | `/auth/me` | ✅ Bearer | — | `200 { id, email, username, createdAt }` |

Protected routes expect: `Authorization: Bearer <accessToken>`. Use the `requireAuth` middleware (`src/auth/middleware.ts`) on any new route that needs a logged-in user — it attaches `req.user = { id, email }`.

Notes:
- Access tokens are short-lived JWTs (15 min). Sent as `Authorization: Bearer <token>` on protected requests.
- Refresh tokens are long-lived (30 days), DB-backed. Stored as SHA-256 hashes — the raw token is never persisted.
- Login/signup return identical generic errors on bad credentials to prevent email enumeration.

### Analysis

| Method | Path | Auth? | Body | Returns |
|---|---|---|---|---|
| POST | `/api/analyze` | ✅ Bearer | `{ code, language }` | `200 { findings[], summary }` |
| POST | `/api/critique` | ✅ Bearer | `{ code, language, findings: { findings[], summary } }` | `200 { reviewedFindings[], summary }` |
| POST | `/api/improve` | ✅ Bearer | `{ code, language, reviewed: { reviewedFindings[], summary } }` | `200 { improvedCode, changeNotes[], summary }` |
| POST | `/api/evaluate` | ✅ Bearer | `{ originalCode, improvedCode, language, reviewed }` | `200 { verdict, scores, rationale, unaddressedFindings? }` |
| POST | `/api/review` | ✅ Bearer | `{ code, language }` | `200 { findings, reviewed, improved, evaluation }` |

`code` is capped at 20,000 chars; `language` at 50. Response shape:

```json
{
  "findings": [
    {
      "severity": "low" | "medium" | "high" | "critical",
      "category": "bug" | "smell" | "complexity" | "security" | "performance" | "style",
      "title": "short title",
      "description": "explanation",
      "line": 12
    }
  ],
  "summary": "overall takeaway"
}
```

Errors:
- `400` — invalid request body (Zod issues returned in `details`).
- `401` — missing or invalid bearer token.
- `502` — model unreachable, timed out, or returned an unparseable response.

`/api/critique` response shape:

```json
{
  "reviewedFindings": [
    {
      "decision": "keep" | "drop" | "modify",
      "original": { ...AnalyzerFinding... },
      "revised":  { ...AnalyzerFinding... },   // only when decision = "modify"
      "reason": "why this decision"
    }
  ],
  "summary": "overall takeaway about review quality"
}
```

### How the agents work

1. Route validates the request body with Zod.
2. Calls the agent (`src/agents/<name>.ts`).
3. Agent builds a strict system prompt + user prompt, sends to **Ollama** (`src/llm/ollama.ts`) with `format: "json"` so the model is constrained to valid JSON output.
4. Response is validated against the agent's Zod schema (`src/agents/schemas.ts`). Bad shape → 502.

Pipeline:
- **Analyzer** (`code` → `findings`)
- **Critic** (`code + findings` → `reviewedFindings` with keep/drop/modify decisions)
- **Improver** (`code + reviewedFindings` → `improvedCode + changeNotes`)
- **Evaluator** (`originalCode + improvedCode + reviewedFindings` → `scores + verdict`)

The full chain is exposed as a single endpoint: **`POST /api/review`**. The orchestrator (`src/orchestrator/pipeline.ts`) runs all four agents in sequence and returns one bundle. Today it blocks until everything finishes (~30–90s on a local 7B model). SSE streaming is the next step.

Every agent follows the same pattern: schema → system prompt → `chatJSON` → validate → return.

---

## Auth model (how it works)

1. **Signup / login** → server returns `accessToken` (JWT) + `refreshToken` (random 48 bytes).
2. Client sends `accessToken` on every API request. Server verifies signature only (no DB hit).
3. When the access token expires (15 min), client calls `/auth/refresh` with the refresh token to get a new access token. Refresh token itself is reused.
4. **Logout** → client calls `/auth/logout` with the refresh token; server marks it revoked in DB.

### Why two tokens?
Access tokens are stateless (fast, can't be revoked). Refresh tokens are stateful (slower, *can* be revoked). Combined, you get fast per-request auth + the ability to log out.

---

## Testing the API

You can use any of:
- **[Hoppscotch](https://hoppscotch.io)** — web-based, no install
- **VS Code REST Client** extension — write `.http` files, click "Send"
- **curl** — see examples above

---

## Roadmap

- ✅ **Phase 0** — Server + DB + health check
- ✅ **Phase 1** — Auth: signup / login / refresh / logout / me + `requireAuth` middleware
- ✅ **Phase 2** — Ollama client + Analyzer agent + `POST /api/analyze`
- ✅ **Phase 3** — Critic / Improver / Evaluator agents (all four agents shipped)
- 🟡 **Phase 4** — Orchestrator ✅ / SSE streaming 🟡
- ⏳ **Phase 5** — Frontend integration

See `InferLoop_AI_PRD.md` in the repo root for the full spec.
