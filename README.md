# Hamilton

**Where serious investors follow serious traders.**

Hamilton is a two-sided investment advisory marketplace. Experts publish verified trade calls and research; retail investors follow track records and access premium content.

---

## Requirements

- **Node.js** 20+
- **npm** 10+
- **Docker** (for PostgreSQL and Redis)

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/alexhoang92/advisory_platform.git
cd advisory_platform
npm install
cd apps/api && npm install && cd ../..
cd apps/web && npm install && cd ../..
cd packages/shared && npm install && cd ../..
```

### 2. Environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in the required values. For local development the defaults work as-is — only the JWT secrets are required:

```env
JWT_ACCESS_SECRET=any-random-string
JWT_REFRESH_SECRET=another-random-string
```

### 3. Start backing services (PostgreSQL + Redis)

```bash
docker compose up -d
```

Starts:
- PostgreSQL 15 on `localhost:5432`
- Redis 7 on `localhost:6379`

### 4. Run database migrations

```bash
cd apps/api
DATABASE_URL="postgresql://postgres:password@localhost:5432/hamilton" npx prisma migrate dev
cd ../..
```

This creates all tables and generates the Prisma client.

### 5. Start the API

```bash
cd apps/api
npx nest start --watch
```

API runs at `http://localhost:3000/api/v1`

### 6. Start the frontend (new terminal)

```bash
cd apps/web
npx vite --host 0.0.0.0
```

Frontend runs at `http://localhost:5173`

---

## All-in-one (after first setup)

Once the above setup is done once, use these commands to start everything:

```bash
# Terminal 1 — backing services
docker compose up -d

# Terminal 2 — API
cd apps/api && npx nest start --watch

# Terminal 3 — Frontend
cd apps/web && npx vite --host 0.0.0.0
```

---

## Useful endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/auth/register` | Register (role: `expert` or `retail`) |
| `POST` | `/api/v1/auth/login` | Login, returns JWT tokens |
| `POST` | `/api/v1/auth/refresh` | Refresh access token |
| `GET` | `/api/v1/auth/me` | Current user (requires auth) |
| `GET` | `/api/v1/users/:username` | View a user profile |
| `PATCH` | `/api/v1/users/me` | Update own profile (requires auth) |
| `GET` | `/api/v1/posts` | Paginated feed |
| `POST` | `/api/v1/posts` | Create a post (requires auth) |
| `GET` | `/api/v1/posts/:id` | Single post (visibility enforced) |
| `PATCH` | `/api/v1/posts/:id` | Edit own post (requires auth) |
| `DELETE` | `/api/v1/posts/:id` | Delete own post (requires auth) |

---

## Project structure

```
advisory_platform/
├── apps/
│   ├── api/          # NestJS backend (port 3000)
│   └── web/          # React + Vite frontend (port 5173)
├── packages/
│   └── shared/       # Shared Zod schemas and TypeScript types
├── docker-compose.yml
├── .env.example
└── turbo.json
```

---

## Stop services

```bash
# Stop API and frontend: Ctrl+C in each terminal

# Stop Docker containers
docker compose down

# Stop and remove volumes (wipes database)
docker compose down -v
```

---

## Prisma commands

```bash
cd apps/api

# Run migrations
DATABASE_URL="postgresql://postgres:password@localhost:5432/hamilton" npx prisma migrate dev

# Open Prisma Studio (DB browser)
DATABASE_URL="postgresql://postgres:password@localhost:5432/hamilton" npx prisma studio

# Regenerate client after schema changes
npx prisma generate
```
