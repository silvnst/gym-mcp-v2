# Gym Tracker (gym-mcp-v2)

Personal gym tracker with a built-in **MCP server**, so AI assistants (e.g. Claude) can read and log your training data.

- 📱 Mobile-first React app: plans, live workout logging, history & progress charts
- ✏️ Recorded workouts are fully editable (name, date, duration, notes, exercises, sets)
- ⏱️ Workout duration is tracked automatically and shown in the history
- 🤖 MCP endpoint at `/mcp` with tools like `get_history`, `log_session`, `update_session`, `get_prs`, `get_training_context`

## Architecture

pnpm workspace:

| Path | Package | What it is |
|---|---|---|
| `artifacts/api-server` | `@workspace/api-server` | Express 5 API + MCP server (Streamable HTTP), serves the built frontend |
| `artifacts/gym-tracker` | `@workspace/gym-tracker` | React 19 + Vite + Tailwind 4 frontend |
| `lib/db` | `@workspace/db` | Drizzle ORM schema + Postgres client |
| `lib/api-spec` | `@workspace/api-spec` | OpenAPI spec, codegen via orval |
| `lib/api-client-react` | `@workspace/api-client-react` | Generated react-query client |
| `lib/api-zod` | `@workspace/api-zod` | Generated zod schemas |

The API server serves everything from one port: `/api/*` (REST), `/mcp` (MCP), and `/*` (the built frontend).

## Deploying on Railway

### 1. Create the project

1. Go to [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo** → select this repository.
2. Railway reads `railway.json` from the repo root, so build command, start command, pre-deploy migration, and health check are configured automatically:
   - **Build**: `pnpm run build:railway` (builds frontend + API server)
   - **Pre-deploy**: `pnpm run db:push` (applies the Drizzle schema to Postgres)
   - **Start**: `node artifacts/api-server/dist/index.mjs`
   - **Health check**: `/api/healthz`

### 2. Add a Postgres database

1. In your Railway project canvas: **Create** (or `⌘K`) → **Database** → **Add PostgreSQL**.
2. This creates a `Postgres` service with a `DATABASE_URL` you can reference from the app.

### 3. Configure variables & secrets

Open your **app service** → **Variables** tab → **New Variable** (changes are applied as staged changes — hit **Deploy** to apply):

| Variable | Required | Value |
|---|---|---|
| `DATABASE_URL` | ✅ | `${{Postgres.DATABASE_URL}}` (a [reference variable](https://docs.railway.com/guides/variables#referencing-another-services-variable) to the Postgres service — use the *private* URL to avoid egress fees) |
| `MCP_SECRET` | ✅ recommended | A long random string (e.g. `openssl rand -hex 32`). Protects the `/mcp` endpoint: clients must call `/mcp?token=<MCP_SECRET>`. Without it, the MCP endpoint is **public**. |
| `NODE_ENV` | optional | `production` |
| `FRONTEND_ORIGIN` | optional | Restrict CORS to your app's URL (defaults to `*`) |

> **Where do secrets go?** Railway has no separate "secrets" store — service **Variables** are encrypted and injected as environment variables at runtime, so `MCP_SECRET` and `DATABASE_URL` both go in the Variables tab. Use **Shared Variables** (Project Settings → Shared Variables) if you want to reuse a value across services. `PORT` is injected automatically by Railway — don't set it.

### 4. Expose the app

App service → **Settings** → **Networking** → **Generate Domain** (or attach a custom domain). The app listens on Railway's injected `PORT` automatically.

### 5. Connect an MCP client

Once deployed, point your MCP client (e.g. Claude custom connector) at:

```
https://<your-app>.up.railway.app/mcp?token=<MCP_SECRET>
```

It speaks Streamable HTTP and exposes read tools (`get_history`, `get_session_detail`, `get_plans`, `get_prs`, `get_volume_by_week`, `get_exercise_history`, `get_training_context`) and write tools (`create_plan`, `update_plan`, `delete_plan`, `log_session`, `update_session`, `delete_session`).

## Local development

```bash
pnpm install

# Push schema to your local Postgres
export DATABASE_URL=postgres://...
pnpm run db:push

# Terminal 1 — frontend dev server (port 5173)
pnpm --filter @workspace/gym-tracker dev

# Terminal 2 — API server (port 8080, proxies non-API routes to Vite)
export DATABASE_URL=postgres://...
pnpm --filter @workspace/api-server dev
```

Open http://localhost:8080.

### Production build (what Railway runs)

```bash
pnpm run build:railway
DATABASE_URL=postgres://... node artifacts/api-server/dist/index.mjs
```

### Changing the API

Edit `lib/api-spec/openapi.yaml`, then regenerate the typed clients:

```bash
pnpm --filter @workspace/api-spec codegen
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP port (injected by Railway) |
| `DATABASE_URL` | — (required) | Postgres connection string |
| `MCP_SECRET` | unset | When set, `/mcp` requires `?token=<MCP_SECRET>` |
| `FRONTEND_ORIGIN` | `*` | CORS allowed origin |
| `FRONTEND_DIST` | auto-detected | Override path to the built frontend |
| `GYM_TRACKER_DEV_URL` | `http://localhost:5173` | Dev-only Vite proxy target |
