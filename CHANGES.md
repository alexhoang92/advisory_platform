# Change Log

## 2026-03-29 — Phase 1 debug fixes

### Problem 1: Frontend blank page

**Root cause A — Stale CJS files in `packages/shared/src/`**
Running `tsc` from the wrong directory compiled CommonJS `.js` files into
`packages/shared/src/` instead of `dist/`. Vite transforms `export * from
'./schemas/auth'` into `./schemas/auth.js`, which resolved to those CJS files
instead of the TypeScript source. A CJS `require()`/`exports` module inside
an ESM context crashes before React can mount — silent blank page.

Fix: deleted the 5 spurious `.js` files from `packages/shared/src/`.

**Root cause B — Vite pre-bundled `@hamilton/shared` from `node_modules`**
Vite's dependency optimizer cached `@hamilton/shared` → `dist/index.js` (CJS
build output) before the `resolve.alias` could take effect. Subsequent
requests used the cached CJS module, bypassing the alias.

Fix: added `optimizeDeps: { exclude: ['@hamilton/shared'] }` to `vite.config.ts`.

**Root cause C — `fs.allow` used a relative path**
`server.fs.allow: ['../..']` was not being resolved correctly by Vite,
leaving `packages/shared/src/` outside the serve allowlist (403).

Fix: changed to `path.resolve(__dirname, '../..')` (absolute path).

### Problem 2: API returning 404 on `GET /`

Not a bug. The API has a global prefix `/api/v1`. Direct access to `/` is
intentionally unhandled. Use `http://localhost:3000/api/v1/posts` etc.

### Problem 3: Vite/NestJS starting from wrong directory

Both `npx nest start` and `npx vite` must be run from their respective app
directories, not the monorepo root. Vite uses the config file's location to
determine the project root, and NestJS uses `nest-cli.json`.

Fix: always `cd apps/api` before starting NestJS, and `cd apps/web` before
starting Vite.

---

## Running instructions

### Prerequisites
- Node.js 20+, npm 10+, Docker

### First-time setup

```bash
# 1. Install dependencies
npm install
cd apps/api && npm install && cd ../..
cd apps/web && npm install && cd ../..
cd packages/shared && npm install && cd ../..

# 2. Create .env
cp .env.example .env
# Edit .env and set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to any random strings

# 3. Start Docker services
docker compose up -d

# 4. Run database migrations (from apps/api)
cd apps/api
DATABASE_URL="postgresql://postgres:password@localhost:5432/hamilton" npx prisma migrate dev
cd ../..
```

### Start services (3 terminals)

```bash
# Terminal 1 — Docker (only needed once, persists across restarts)
docker compose up -d

# Terminal 2 — API  (MUST cd first)
cd /path/to/advisory_platform/apps/api
npx nest start --watch

# Terminal 3 — Frontend  (MUST cd first)
cd /path/to/advisory_platform/apps/web
npx vite --host 0.0.0.0
```

**API:** http://localhost:3000/api/v1
**Frontend:** http://localhost:5173

### Common mistakes to avoid

| Mistake | Fix |
|---|---|
| Running `npx nest start` from repo root | `cd apps/api` first |
| Running `npx vite` from repo root | `cd apps/web` first |
| Running `npx tsc` from repo root or wrong dir | Always `cd` into the package first |
| Port 5173 already in use | `pkill -f vite` then restart |
| Shared package CJS files in `src/` | Delete any `.js` files inside `packages/shared/src/` |

### Vite cache reset (if blank page returns)

```bash
rm -rf apps/web/node_modules/.vite
pkill -f vite
cd apps/web && npx vite --host 0.0.0.0
```

### Stop everything

```bash
pkill -f "nest start"
pkill -f vite
docker compose down
```
