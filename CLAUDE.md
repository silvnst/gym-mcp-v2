# Gym Tracker (gym-mcp-v2)

Personal gym tracker with a React frontend, an Express API and an MCP server, deployed on Railway. See README.md for architecture and setup.

## Workflow

- Work on the `dev` branch. Railway deploys `dev` to the **dev** environment (own Postgres, own MCP secret) and `main` to **production**.
- Changes reach `main` only through a pull request from `dev` after testing on dev.
- Never touch production data from a dev task.
- Schema changes go through migrations: edit `lib/db/src/schema/index.ts`, run `DATABASE_URL=... pnpm run db:generate`, review the SQL in `lib/db/migrations`, commit it. Railway runs `pnpm run db:migrate` before each deploy.
- Never edit a migration that has already run on production; add a new one. Prefer additive changes; renames and drops need a plan for existing data.

## API changes

1. Edit `lib/api-spec/openapi.yaml`.
2. `pnpm --filter @workspace/api-spec codegen` regenerates the React Query client and zod schemas.
3. Update routes in `artifacts/api-server/src/routes` and, where useful, the MCP tools in `artifacts/api-server/src/mcp/server.ts`.

## Checks

- `pnpm run typecheck` for the whole workspace.
- `pnpm run build:railway` builds what Railway runs.

## Design

Follow `docs/design-system.md` (Bumper). In short: English UI in sentence case, no em dashes or middle dots in UI text, metric only, DM Sans with tabular figures for numbers, 2px outlines only on things you can tap, cards as plain surfaces, one yellow main action per screen with the only hard shadow. Use the pieces in `artifacts/gym-tracker/src/components/bumper.tsx` and the `bp-*` colour tokens.
