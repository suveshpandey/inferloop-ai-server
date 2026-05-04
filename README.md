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
│   │   └── refresh.ts         # issue / find / revoke refresh tokens
│   └── api/
│       └── routes/
│           ├── health.ts      # GET /health  → liveness + DB ping
│           └── auth.ts        # /auth/signup, /login, /refresh, /logout
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
- 🟡 **Phase 2** — Ollama client + Analyzer agent — *next*
- ⏳ **Phase 3** — Critic / Improver / Evaluator agents
- ⏳ **Phase 4** — Orchestrator + SSE streaming
- ⏳ **Phase 5** — Frontend integration

See `InferLoop_AI_PRD.md` in the repo root for the full spec.
