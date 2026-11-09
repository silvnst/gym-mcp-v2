# Gym Tracker (gym-mcp-v2)

Personal gym tracker with a built-in **MCP server**, so AI assistants (e.g. Claude) can read and log your training data.

- 📱 Mobile-first React app: plans, live workout logging, history & progress charts
- 👥 Multi-user with Auth0 login: each user has their own plans, workouts, and stats
- ✏️ Recorded workouts are fully editable (name, date, duration, notes, exercises, sets)
- ⏱️ Workout duration is tracked automatically and shown in the history
- 🤖 MCP endpoint at `/mcp` with tools like `get_history`, `log_session`, `update_session`, `get_prs`, `get_training_context`

## Sign-in and users

Sign-in runs through **Auth0**; one Auth0 API protects both the web app and `/mcp`. Every request carries an access token, the server validates it and scopes all data to the matching profile. Setup steps are in [docs/auth.md](docs/auth.md).

- A `users` table owns plans & sessions. A login is linked to a profile by its Auth0 `sub`.
- The first time an email signs in, `AUTH_CLAIM_MAP` can link it to an existing profile (so old data stays with its owner); any other allowed email gets a fresh profile.
- Only emails in `AUTH_ALLOWED_EMAILS` or `AUTH_CLAIM_MAP` may sign in, unless `AUTH_ALLOW_ANY_USER=true`.
- Data created before multi-user support is adopted by the default user on first boot (set `DEFAULT_USER_NAME` to control its name). The default user also owns the Garmin data.

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
   - **Pre-deploy**: `pnpm run db:migrate` (applies pending SQL migrations from `lib/db/migrations`)
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
| `AUTH0_DOMAIN`, `AUTH0_AUDIENCE` | ✅ | Auth0 tenant domain and the API identifier (the canonical MCP URL, `https://<your-app>/mcp`). Without them every API call is rejected. See [docs/auth.md](docs/auth.md). |
| `AUTH_CLAIM_MAP`, `AUTH_ALLOWED_EMAILS` | ✅ | Who may sign in and which existing profile an email takes over. |
| `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE` | ✅ | Frontend Auth0 settings, read at **build** time. |
| `NODE_ENV` | optional | `production` |
| `FRONTEND_ORIGIN` | optional | Restrict CORS to your app's URL (defaults to `*`) |

> **Where do secrets go?** Railway has no separate "secrets" store — service **Variables** are encrypted and injected as environment variables at runtime, so `DATABASE_URL` and the Auth0 settings go in the Variables tab. Use **Shared Variables** (Project Settings → Shared Variables) if you want to reuse a value across services. `PORT` is injected automatically by Railway — don't set it.

### 4. Expose the app

App service → **Settings** → **Networking** → **Generate Domain** (or attach a custom domain). The app listens on Railway's injected `PORT` automatically.

### 5. Connect an MCP client

Once deployed, point your MCP client (e.g. Claude custom connector) at:

```
https://<your-app>.up.railway.app/mcp
```

The client discovers Auth0 from the server's OAuth metadata and opens a sign-in window; no token goes into the URL.

It speaks Streamable HTTP and exposes read tools (`get_history`, `get_session_detail`, `get_plans`, `get_prs`, `get_volume_by_week`, `get_exercise_history`, `get_training_context`) and write tools (`create_plan`, `update_plan`, `delete_plan`, `log_session`, `update_session`, `delete_session`).

## Local development

```bash
pnpm install

# Apply migrations to your local Postgres
export DATABASE_URL=postgres://...
pnpm run db:migrate

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

### Changing the database

Edit `lib/db/src/schema/index.ts`, then generate and review a migration:

```bash
DATABASE_URL=postgres://... pnpm run db:generate
```

The SQL lands in `lib/db/migrations`. Commit it; Railway applies it before the next deploy. Databases created before migrations existed are adopted automatically: the baseline is recorded as applied and only newer migrations run.

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
| `AUTH_DISABLED` | unset | `true` skips auth and acts as the default user. Local development only, ignored in production |
| `DEFAULT_USER_NAME` | `Default` | Name of the auto-created first profile |
| `FRONTEND_ORIGIN` | `*` | CORS allowed origin |
| `FRONTEND_DIST` | auto-detected | Override path to the built frontend |
| `GARMIN_API_KEY` | unset | Garmin Connect Personal API key. When set, the server syncs sleep, HRV, resting heart rate, Body Battery and activities every 2 hours |
| `GARMIN_USER_ID` | default profile | Profile the Garmin key belongs to |
| `GARMIN_TIMEZONE` | `Europe/Zurich` | Time zone for "today" in the Garmin sync |
| `GYM_TRACKER_DEV_URL` | `http://localhost:5173` | Dev-only Vite proxy target |
