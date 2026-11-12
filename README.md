# Trello School

A Trello-style board that syncs tickets from GitHub issues, generates
AI implementation plans per ticket (with human-confirmed dependency
detection and hash-chained approval before anything is marked done),
and renders a dependency graph across a board.

This repo serves two purposes at once:
- It's the real source for the Turborepo monorepo (`apps/Backend`,
  `apps/Frontend`, `apps/Websockets`, `apps/Worker`, `packages/db`).
- It's also the GitHub App's webhook source — opening a real issue
  here is what the app's own plan-generation Worker reads from
  (`apps/Worker/src/repoClone.ts`) to ground implementation plans in
  the actual code, and what syncs onto the board via
  `apps/Backend/src/routes/github.ts`.

See `docs/` for the fuller design history (`project-context.md`,
`github-integration-architecture.md`, `production-blockers.md`, the
frontend redesign plans).

## Running locally

```sh
pnpm install
pnpm dev
```

Each app under `apps/*` needs its own `.env` (not committed) —
see each app's `src/index.ts` for the variables it reads.
