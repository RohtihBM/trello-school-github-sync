# Project context — read this first in a new session

This file exists because the conversation that built most of this project
got very long. If you're picking this up fresh, read this whole file
before touching any code — it has the things that aren't obvious from the
code alone: the real goal, decisions made and why, credentials map, and
hard-won lessons that are easy to silently re-break.

## What this actually is

Not just a Trello clone. The real goal, established partway through: a
system where GitHub issues sync into a board, an AI generates an
**implementation plan** (deliberately not code, deliberately no
auto-push), discussed in a per-ticket chat, with dependency links between
tickets and human approval checkpoints. The Trello-clone pieces (auth,
orgs, boards, live updates) are the substrate this is built on top of, not
the end goal.

**Why this scope, specifically** — read `docs/production-blockers.md`
first if you need the reasoning: it walks through every real obstacle
(cost, security, sync problems) that led to cutting auto-codegen/auto-push
from the original idea. `docs/github-integration-architecture.md` is the
actual target system this project is building toward, with a 7-phase build
order. `docs/remaining-implementation-plan.md` is the concrete,
step-by-step checklist for what's left (phases 3–7), and is the file to
work from day-to-day.

## Who this is for, and the standing working arrangement

The user is building this **as a personal portfolio/resume project for
credibility**, explicitly not as a product — this shapes priorities:
depth of understanding and the ability to defend design tradeoffs in an
interview matters more than feature breadth or shipping speed. Cost-
consciousness is real, not performative (it's their own money).

**Two standing preferences, both saved in memory, both still apply:**
1. **Seed bugs into new features deliberately**, tell the user something's
   broken without saying where, let them debug it, explain the concept
   after. Only applies to genuinely *new* code, never retrofit onto
   already-working code. (Memory: `feedback_seed_bugs_for_learning`)
2. **Explain the what/why/how of every implementation step**, grounded
   concretely in this project's real code/data/numbers — never generic
   analogies. (Memory: `feedback_explain_every_implementation_step`)

If a new session doesn't have these in its memory already, re-read them
from `~/.claude/projects/-Users-rohith-b-m/memory/` or just ask the user to
confirm they still apply.

## Full architecture

Turborepo, npm workspaces. Five pieces:

| App/package | What it is | Port |
|---|---|---|
| `apps/Backend` | Express REST API | 3001 |
| `apps/Websockets` | `ws` server for live board updates, plus a tiny internal-only HTTP server | 8081 (public), 8082 (internal) |
| `apps/Worker` | **New in phase 2** — background job consumer (BullMQ), runs the actual Claude calls | no port, Redis-driven |
| `apps/Frontend` | React + Vite + Tailwind | 5173 (dev) |
| `packages/db` | Shared Prisma client + schema — every app imports `@repo/db`, never has its own copy | — |

**External dependencies:** Neon Postgres (the actual database), Redis
(local, via `brew services start redis` — backs the job queue and the
rate limiter), `ngrok` (tunnels `Backend` so GitHub's real webhook can
reach `localhost:3001`), a real GitHub App installed on a dedicated public
test repo.

**How the pieces talk to each other** — this is non-obvious and worth
internalizing:
- Frontend → Backend: plain REST, JWT in `Authorization: Bearer`.
- Frontend → Websockets: a WebSocket connection per browser tab, `join`
  message authenticates with the same JWT.
- Backend/Worker → Websockets: **the only inter-process link**, a tiny
  internal HTTP endpoint on port 8082, gated by a shared secret
  (`INTERNAL_API_SECRET`), used to push live updates (`notifyBoard` in
  both `Backend` and `Worker`, duplicated, not shared as a package).
- Backend → Worker: never direct — only via the Redis-backed BullMQ queue
  (`"plan-generation"`). Backend creates a `PlanGenerationJob` row, enqueues
  its id, and returns immediately (`202 Accepted`). Worker picks it up on
  its own schedule, writes results straight to Postgres, and calls
  `notifyBoard` itself.

## Credentials/config map (not the actual values — where they live)

- `apps/Backend/.env` — `JWT_SECRET`, `INTERNAL_API_SECRET`,
  `INTERNAL_BROADCAST_URL`, `GITHUB_SYNC_BOARD_ID`, `GITHUB_WEBHOOK_SECRET`,
  `REDIS_URL`.
- `apps/Websockets/.env` — `JWT_SECRET`, `INTERNAL_API_SECRET`,
  `INTERNAL_PORT`.
- `apps/Worker/.env` — `INTERNAL_API_SECRET`, `INTERNAL_BROADCAST_URL`,
  `REDIS_URL`.
- `packages/db/.env` — `DATABASE_URL` (Neon). Loaded relative to **the
  package's own file location**, not the caller's cwd — this is why
  `packages/db/src/index.ts` resolves its `.env` path via
  `path.dirname(fileURLToPath(import.meta.url))` instead of a plain
  `dotenv/config` import. Matters because other apps import `@repo/db`
  from a different working directory.
- GitHub App: installed on `https://github.com/RohtihBM/trello-school-github-sync`
  (a real, public, dedicated test repo — not the main project repo).
  Webhook URL points at the current `ngrok` tunnel, which **changes every
  time `ngrok` restarts** (free tier, no stable subdomain) — if webhook
  deliveries stop working, check this first.
- Test users: `teammate@example.com` / `password123` (member of Demo Org),
  `rohith@email.com` (the actual account holder, ADMIN of Demo Org).
- The board everything's been tested against: **"Demo Board"**, inside
  **"Demo Org"**.

## What's actually built and verified (not just planned)

**Phase 1 — ticket sync.** Done. Real GitHub App, real webhook receiver
with HMAC signature verification (mounted *before* `express.json()` —
verification needs the raw body), idempotent upsert on `githubNodeId`.
Both `issues.opened` and `issues.edited` sync live. Re-verified working
after a month-long gap in an earlier session — nothing rotted.

**Phase 2 — plan generation + chat.** Done, including the job queue,
rate limiting, and shared repo clone that were originally planned for
phase 7 but pulled forward (see architecture doc for why). The UI was
originally functionally correct but visually rough (no markdown
rendering, a cramped panel) — **this has since been fully addressed by
the frontend makeover** (`docs/frontend-makeover-plan.md`, phases A–H,
all complete): `PlanPanel` now renders real markdown and real chat
bubbles, built on a real design system.

**Phase 3 — dependencies, cycle detection, contract diffing.** *In
progress.* Steps 1–5 of `remaining-implementation-plan.md` are done:
`Issue.status`/`TicketStatus` migrated, `TicketDependency` model migrated,
the cycle-check algorithm (`apps/Backend/src/lib/cycleCheck.ts`) written
and verified against a hand-built graph,
`POST /issues/:id/dependencies` built and tested (cycle rejection,
duplicate rejection, same-board enforcement, membership check — all
verified against the real running server), and **step 5** — `DONE` is now
wired to the existing "move to Completed" action: `handleMoveIssue` in
`apps/Websockets/src/handlers.ts` checks whether the *target* section's
`title === "Completed"` and, if so, sets `status: "DONE"` in the same
`prisma.issue.update` call that does the move (no separate "mark as done"
button exists or was added). Verified against the real running
Websockets server with disposable test data: moved a test issue into a
temp "Completed" section, confirmed both the `issue-moved` broadcast and
the Postgres row showed `status: "DONE"`, then cleaned up. Also confirmed
along the way that the Demo Board already has a real "Completed" section
(`cmu9oq9cr000cyy2d37ivxs0v`, seeded earlier) — this feature applies to it
directly, nothing further to wire up there.

**Step 6** is also done: `apps/Websockets/src/lib/resolveDependencies.ts`
(`resolveDependenciesOnDone`), called from `handleMoveIssue` right after
the `DONE` write, only when `movedIntoCompleted` is true. For every
`TicketDependency` where the finished ticket is the `blocker`: reads
`actualContract` straight from the finished ticket's own `plan` field
(never a fresh Claude call), diffs it against `assumedContract`, writes
`actualContract`/`mismatchFlag` onto the edge, and broadcasts a
`dependency-mismatch` message when they differ. Separately, for every
distinct ticket that was blocked by it: checks whether *all* of its
`TicketDependency` blockers are now `DONE`, and if so flips it from
`BLOCKED` to `READY` (guarded so only a ticket actually in `BLOCKED` gets
touched) and broadcasts `issue-updated` (the same type the GitHub-sync
edit path already uses, reusing the frontend's existing merge handling in
`BoardView.tsx` rather than adding a new case). One design deviation from
the plan doc's literal wording ("Worker/Backend"): this logic lives in
`Websockets` instead, because that's where the `DONE` trigger itself
already lives (step 5) — it broadcasts directly via `broadcastToBoard`
rather than hopping through the internal-HTTP `notifyBoard` path, since no
hop is needed from inside that process. Verified against the real running
system with a 3-ticket disposable dependency chain (A and C both blocked
on B; A's assumed contract matched B's plan, C's didn't): moved B into
Completed over a real WS connection, confirmed A and C both flipped to
`READY`, `depA.mismatchFlag` was `false`, `depC.mismatchFlag` was `true`
with a `dependency-mismatch` broadcast received, then cleaned up all test
rows.

**Step 7** is also done, plus a real gap it surfaced and fixed along the
way: `POST /issues/:id/dependencies` (built in step 4) never broadcast
anything — every other write path in the app (`issue-moved`, `plan-ready`,
GitHub sync) does, so this one silently broke the live-board invariant.
Fixed in `apps/Backend/src/routes/dependency.ts`: after the transaction,
re-fetches the blocked issue with `dependsOn` (+ each blocker's `title`)
and calls `notifyBoard` with `{ type: "issue-updated", issue }`. Also
extended the `board-state` query in `apps/Websockets/src/index.ts` to
include `dependsOn` so it's there on initial load, not just after a live
update.

Frontend (`apps/Frontend/src/lib/api.ts`, `components/PlanPanel.tsx`,
`pages/BoardView.tsx`): `Issue` now carries `status` and `dependsOn`
(each edge's `assumedContract`/`actualContract`/`mismatchFlag` + the
blocker's title). `PlanPanel` got a "Depends on" section — a form to pick
another ticket on the same board and enter `assumedContract` (posts via
the step-4 route), plus a list of existing dependencies showing a
waiting/resolved/mismatch badge and both contract strings once the
blocker resolves. `BoardView.tsx`'s `mergeIssue` now falls back to the
existing `dependsOn` the same way it already did for `planMessages` (the
`issue-moved` and step-6 READY-flip broadcasts don't include the relation
either), and a new `dependency-mismatch` case patches just the one
matching edge in place, since that broadcast carries edge data, not a
full issue. Verified: a disposable REST+WS test confirmed the fixed route
broadcasts live with `dependsOn` populated and the DB shows `BLOCKED`;
`vite build` and all three workspaces' `tsc --noEmit` are clean.

**Step 8 is also done — phase 3 is fully complete.** Verified through
the actual running UI, driven headlessly with Playwright + Chromium (no
project skill existed for this yet; installed for the session, left in
place since it's reusable — see `docs/production-blockers.md`-style
honesty note: ~100MB in `~/Library/Caches/ms-playwright` if ever
reclaimed). Created two real tickets through the UI, declared A depends
on B via the "Depends on" picker, confirmed the reverse edge (B depends
on A) is rejected live with "this would create a circular dependency"
shown in red on B's card, moved B into Completed (via the section
dropdown — this app has no real drag-and-drop despite a ticket on the
board literally titled "Drag-and-drop UI"), then confirmed directly in
Postgres that B's status became `DONE` and A's flipped to `READY` — the
full step 5 → step 6 chain fired correctly from a genuine UI action, not
just scripted tests.

**One real gap surfaced by this click-through, not yet fixed:** B had no
`plan` (never had "Generate plan" clicked). Step 6 correctly wrote
`actualContract: null, mismatchFlag: false` for that case — exactly as
specified — but `PlanPanel`'s badge logic reads "waiting" whenever
`actualContract === null`, with no way to distinguish "blocker still not
done" from "blocker is DONE, but never had anything to compare against."
A dependent's badge can get stuck on "waiting" forever even after its
blocker genuinely finishes. Not a bug in what's built — a real UX/design
gap worth a fourth badge state (e.g. "done, no contract") at some point.

**Phase 4 — file-overlap warnings. Done.** A blocker surfaced before
building: the plan doc said `Issue.intendedFiles` "already exists, just
never used" — true of the schema, but the Claude prompt in
`processPlanJob.ts` never actually asked for it, so step 1/2 required
getting Claude to emit it, not just read it. Fixed by appending one
required line to the existing plan-generation prompt — `INTENDED_FILES:
[...]` — parsed deterministically out of the same response
(`extractIntendedFiles`, degrades to `[]` on a malformed/missing marker
rather than failing the whole job). `apps/Worker/src/fileOverlap.ts`
(`findOverlappingIssues`) queries other `OPEN`/`PLANNING`/`BLOCKED`
issues on the same board via Prisma's `hasSome` on the string-array
column — no new schema. The `plan-ready` broadcast now carries an
`overlaps` array; the frontend (`BoardView.tsx`) updates BOTH sides of
the overlap from that one message (a shared file is symmetric, so the
ticket just named as an overlap gets this one added back to its own
list, no second broadcast needed) into a `fileOverlaps` state that is
**deliberately not persisted** — phase 4 is "a query, not a model," so
this is lost on refresh until a relevant ticket's plan regenerates, a
known and accepted consequence, not a bug. `PlanPanel` shows it as an
amber warning banner, never a block. Verified with one real Claude call
(a disposable ticket whose description explicitly named a real repo
file, steering Claude to declare that exact path) against a pre-seeded
"already claims this file" ticket — confirmed the live broadcast carried
the overlap and Postgres showed the parsed `intendedFiles`; separately
confirmed two tickets with disjoint file lists produce zero overlaps.

**Phase 5 — dependency graph UI. Done.** `@xyflow/react` + `dagre`
installed into `apps/Frontend` (React 19, no peer-dep conflicts). New
route `GET /boards/:boardId/dependencies` (`apps/Backend/src/routes/board.ts`)
returns just `{ issues: [{id,title,status}], edges: [{id,blockedId,blockerId}] }`
— the graph's only data source, scoped via the blocked side's `boardId`
the same way every other dependency query in this app is. New page
`/boards/:boardId/graph` (`apps/Frontend/src/pages/GraphView.tsx`): dagre
computes layout (`rankdir: "LR"`, blocker → blocked, the prerequisite
pointing at what it unblocks) before React Flow ever sees a position —
no hand-positioned nodes. Nodes are color-coded by `status`, which,
incidentally, makes this the first place in the whole app a ticket's
status is visible on screen at all (closing part of the gap logged
during phase 3's click-through — the Kanban board itself still has no
status badge). Linked from `BoardView.tsx`'s header ("Dependency graph").
Cycle-prevention isn't re-implemented here — it holds "by construction"
per the plan doc, since phase 3's `wouldCreateCycle` check already makes
a cyclic edge set unreachable; this view only ever needs to render a DAG.
Verified for real: hit the live REST route with a seeded 3-ticket chain
(A←B←C) and confirmed the exact edges came back; then drove the actual
browser via Playwright (signed in, clicked through from the board) and
confirmed 13 nodes / 2 edges rendered with zero console errors,
screenshot showed the correct C→B→A order and BLOCKED tickets in red.
`tsc --noEmit` clean on Backend + Frontend, `vite build` clean (new
bundle-size warning only, not an error — React Flow + dagre add real
weight; not addressed, noted as a possible future code-split).

**Phase 6 — hash-chained approvals. Done.** A real, substantive gap
surfaced before building, from re-reading `github-integration-architecture.md`
directly rather than trusting the condensed plan file: its own
`TicketStatus` comment says `READY // plan approved, no open blockers` —
**both** conditions. Phase 3's `resolveDependenciesOnDone` only ever
checked the blocker-side condition and flipped straight to `READY`,
because approval didn't exist yet when it was written — meaning a ticket
could already be sitting at `READY` with its plan never approved by
anyone. Fixed both directions as part of this phase, not as a separate
detour: `resolveDependenciesOnDone` (`apps/Websockets/src/lib/resolveDependencies.ts`)
now only sets `READY` when an `ApprovalRecord` also exists, otherwise
falling back to `PLANNING`/`OPEN`; the new approve route only sets
`READY` when there's also no open blocker. Neither path could have been
written correctly in isolation — this was only visible once approval
existed as a concept.

New model `ApprovalRecord` (`issueId`, `approvedById`, `contentHash`,
`previousHash`), migrated. `POST /issues/:id/approve`
(`apps/Backend/src/routes/approval.ts`): rejects a ticket with no plan,
hashes the plan with sha256, chains per-**board** (not per-ticket —
simpler, and still makes tampering with any past approval on the board
detectable). `apps/Backend/src/scripts/verifyApprovalChain.ts` — a real,
permanent script (not disposable), walks a board's whole chain in
`createdAt` order and reports exactly which link breaks, continuing past
the first break rather than stopping there, so a tampered record doesn't
hide further tampering after it. `PlanPanel` got an "Approve plan" button
plus a `Status: X` line (same side-effect as phase 5 — another place
ticket status is now visible that wasn't before).

Verified for real, the same "prove the fix by reproducing the failure
first" discipline used throughout phase 2: built a real 2-record chain
through the live REST route, ran the script (reported intact), then
hand-edited the first record's `contentHash` directly in Postgres and
reran — the script correctly reported record 2 broken (not record 1,
since record 1's *stored* hash is unchanged; what broke is record 2's
expectation of it — the actual tamper-evident property, not a
coincidence), exit code 1. Also drove the real "Approve plan" button in
a browser via Playwright and confirmed the ticket's displayed status
flipped from `OPEN` to `READY` live, zero console errors. All test data,
scripts, and screenshots cleaned up afterward. `tsc --noEmit` clean
across Backend/Websockets/Frontend, `vite build` clean.

**Phase 7a — Redis Pub/Sub for `Websockets` scaling. Done. This was the
last item in `remaining-implementation-plan.md` — the whole plan is now
complete.** Explicitly built ahead of real need (one instance has never
needed this), for the learning value, per the plan doc's own framing.

Added `ioredis` to `apps/Websockets` (new `REDIS_URL` in its `.env`).
`rooms.ts` split into two concerns that used to be conflated in one `Map`:
a `localSockets` map (still per-process, still just actual `WebSocket`
objects — a socket can never be shared across processes) for
`broadcastToBoard`, now UNCHANGED in behavior, only ever touching this
process's own connections; and presence (`getBoardUsers`/`joinBoard`/
`leaveBoard`) moved to a Redis hash (`HSET board:{boardId}:users`), shared
across every instance, so a user connected to instance 2 shows up in the
presence list sent to someone joining on instance 1. New `pubsub.ts`:
`publishToBoard` (publishes to a `board:{boardId}` Redis channel) replaces
every direct `broadcastToBoard` call across the app — `handlers.ts`,
`resolveDependencies.ts`, `index.ts`'s join/leave paths, and critically
`internal.ts`. `startBoardSubscriber` (`PSUBSCRIBE board:*`, one dedicated
`ioredis` connection — a subscribing connection can't run other commands)
turns every published message back into a call to the real, local
`broadcastToBoard`, on every instance, publisher included (Redis delivers
to all subscribers of a channel, not just "the others").

**The most important fix in this phase, concretely identified before
touching any code**: `internal.ts`'s HTTP receiver (the only way
Backend/Worker ever reach `Websockets`) was calling `broadcastToBoard`
directly — meaning with two instances, `INTERNAL_BROADCAST_URL` (a single
URL) could only ever reach ONE of them, so a GitHub webhook event or a
`plan-ready` result would silently never show up for anyone connected to
the other instance. This is now `publishToBoard`, fixing exactly that.

Verified for real, not just by reasoning about it: ran a genuine second
`Websockets` instance on different ports (`PORT=8091 INTERNAL_PORT=8092`),
connected one real client to each over the actual `ws://` protocol, and
proved two things — (1) a `create-issue` action by the client on instance
1 was received live by the client on instance 2, the literal failure this
phase exists to fix; (2) a synthetic internal-HTTP push to instance 1's
internal port (simulating what Backend/Worker actually do) was received
by BOTH clients, confirming the `internal.ts` fix specifically. All test
data cleaned up, second instance torn down afterward. `tsc --noEmit`
clean on `apps/Websockets`.

One honestly-reported wrinkle: a planned extra single-instance regression
sanity check (confirm normal operation still works post-refactor) hit a
local machine issue mid-session — Node's DNS resolver on this machine
points at `127.0.0.1` (some local proxy/VPN/security-agent service, not
identified further), which started refusing connections, blocking all
Postgres access for every Node process (including the already-running
Backend, unrelated to anything changed here) while the OS's own resolver
(`nslookup`/`scutil`) kept working fine. Not caused by this phase's code —
confirmed by the fact it hit an already-running, unmodified process too —
and the actual required proof above had already fully passed before this
appeared. If a fresh session hits "Can't reach database server" that
*doesn't* clear after one retry (the normal Neon-cold-start pattern, see
lesson #2), check `node -e "require('dns').getServers()"` — `127.0.0.1`
there instead of the real network's resolver is this same issue, a
machine/network problem to flag to the user, not a code bug to chase.

## Hard-won lessons — things that will silently break if forgotten

1. **`prisma migrate dev` doesn't work in this non-interactive
   environment.** Every migration in this project was created via
   `prisma migrate diff --from-url ... --to-schema-datamodel ... --script`
   written into a manually-created timestamped migration folder, then
   applied with `prisma migrate deploy`. Don't try `migrate dev` again —
   it'll fail the same way every time.
2. **Neon auto-suspends when idle.** The *first* database query after any
   gap will fail with "Can't reach database server" — this is not a bug,
   just retry once. Happened repeatedly throughout this project.
3. **`npm install -D typescript@X` sometimes silently fails to update the
   version in a workspace**, due to a stale orphaned entry in
   `package-lock.json`. Fix: find and delete the stale
   `"apps/X/node_modules/typescript"` entry directly from the lockfile
   JSON, then reinstall. Hit this at least three times across different
   apps.
4. **The Claude Agent SDK's `allowedTools` does NOT restrict tool
   access** — it only skips the permission *prompt* for tools already
   listed. The actual restriction is the separate `tools` option, which
   defaults to the full `claude_code` preset (sub-agents, Artifact
   publishing, everything) if omitted. This was a real, serious bug found
   by testing — a worker call spawned a genuine sub-agent and wrote real
   files to disk before this was caught. Fixed in
   `apps/Worker/src/processPlanJob.ts`'s `RESTRICTED_OPTIONS` constant.
   **Any new Claude invocation must set `tools` explicitly, every time.**
5. **The SDK's `resume` option only reloads conversation history** — it
   does NOT carry over the original session's `tools`/`model`/etc. Every
   call, resumed or fresh, must set `RESTRICTED_OPTIONS` itself, or a
   resumed chat call would silently reopen the hole from #4.
6. **BullMQ's `worker.on("failed", ...)` fires on EVERY failed attempt**,
   including ones about to be retried — not just the final failure. Must
   check `job.attemptsMade >= job.opts.attempts` before marking anything
   permanently `FAILED` in Postgres. Verified directly against BullMQ's
   own source before relying on this.
7. **`apps/Worker`/`apps/Backend`/`apps/Websockets` don't set
   `"type": "module"`** in `package.json` (only `packages/db` does) —
   `import.meta.dirname` will throw a `tsc` error in these apps; use
   `process.cwd()` instead (reliable because `npm run --workspace=X`
   always sets cwd to that workspace's directory).
8. **Position fields need `max + 1`, never `count()`** — `count()` breaks
   the instant there's a gap from a deleted row, causing duplicate
   positions. Found and fixed this exact bug twice in different files.
9. **When testing destructively (delete, cascade checks, etc.), always
   create disposable test data first.** Used a real seeded ticket for a
   cascade-delete test once by mistake and had to restore it. Learned the
   hard way; don't repeat it.
10. **A recurring local-machine DNS issue, not a code bug — and no real
    fix exists for it from inside this project.** At least five times
    across this session (end of phase 7a, mid-Phase C, mid-Phase G, twice
    more during Phase H), "Can't reach database server" persisted past
    the normal single Neon-cold-start retry, sometimes for 40s, sometimes
    well over a minute. Diagnosis each time: `node -e "require('dns').getServers()"`
    shows `127.0.0.1` (some local VPN/security-agent proxy), and
    `node -e "require('dns').resolve4('<any-hostname>', cb)"` fails
    identically for *every* hostname, not just Neon's, while `curl`/
    general internet keeps working the whole time. **A DNS-override
    workaround was tried and genuinely tested with direct A/B
    comparisons — it does nothing.** Prisma's query engine doesn't
    resolve hostnames through Node's `dns` module at all, so
    `dns.setServers()` has zero effect on it; every apparent "fix" was
    just the underlying issue clearing on its own, coincidentally
    overlapping with the workaround being active. **The only real
    response**: retry once (the Neon-coldstart case), and if it persists,
    just wait — poll every 5-10s rather than guessing a fixed delay, and
    don't waste time trying to engineer around it from inside the
    project.

## How to resume work

**Both `remaining-implementation-plan.md` (phases 3–7a) and
`frontend-makeover-plan.md` (phases A–H) are now fully implemented.**
There is no next step waiting in either document. Resuming work now
means one of: (a) picking something from "Explicitly open, not
forgotten" below, (b) the user naming something new, or (c) the larger
AI-suggested-dependency/feature-grouping design discussed but
deliberately deferred (see below).

1. Confirm Redis is running: `redis-cli ping`.
2. Start the four services: `npm run dev --workspace=<backend|websockets|worker|frontend>`.
3. If picking up an open item below, follow the same loop used
   throughout: explain what/why/how → implement → type-check every
   workspace that could be affected → verify against the *real* running
   services and real Neon data, never just trust a type-check → clean up
   any test data created.

## Explicitly open, not forgotten

- **The frontend makeover is complete — all 8 phases (A–H).** See
  `docs/frontend-makeover-plan.md` for the full diagnosis, every phase's
  detail, and the real bugs/gaps each one found and fixed along the way
  (not just visual polish — a missing `GET /organisations` route, the
  "waiting forever" dependency-badge gap, several real
  `@axe-core/playwright` violations). Headline results: a real design
  system (`apps/Frontend/src/components/ui/`, shadcn/ui pattern) now
  underlies every page; the Kanban board uses real `@dnd-kit`
  drag-and-drop; `PlanPanel` renders real markdown and real chat
  bubbles; every page passes an automated accessibility scan with 0
  violations; the full real user flow (sign in → create tickets →
  generate a plan → declare a dependency → drag to Completed → contract
  diff) was verified end to end against the real running app, with
  Postgres cross-checked directly, not just the UI. One correction
  worth knowing: an earlier note in that doc claimed a DNS-override
  workaround fixed this machine's recurring local connectivity issue —
  that was wrong (direct A/B testing proved Prisma's connectivity is
  unaffected by it), corrected in both docs, and the workaround file
  deleted. The real guidance for that issue is just lesson #2: retry,
  and if that's not enough, wait — there's no in-project fix for a local
  machine/network problem.
- **Post-makeover addition (after phases A–H): `BoardView`'s
  interaction model was redesigned** — clicking a card no longer
  inline-expands a panel inside it (the exact mechanism behind a real
  bug found in Phase H); it opens a docked panel at the right edge
  instead, with the board's columns measurably sharing the screen
  width, and a "complete view" button that expands the same content
  into a large elevated dialog over a dimmed/blurred board. See
  `docs/frontend-makeover-plan.md`'s "Post-makeover addition" section
  for the full detail. The user named extending this same interaction
  quality bar to the rest of the app (`BoardsList`, auth pages) as the
  ultimate direction — not yet started, revisit when asked.
- **A second post-makeover addition: AI-suggested dependencies** — the
  feature designed and deliberately deferred back during phase 3,
  finally built once the user hit the exact pain point that motivated
  it (manually typing "which ticket, what do I expect from it" felt
  backwards). Claude now suggests a dependency alongside plan
  generation; never auto-committed, a human still confirms or dismisses
  it. New `Issue.suggestedDependency Json?` field, a new dismiss route,
  a banner in `PlanPanel`. A real bug was found and fixed by testing: a
  malformed-JSON edge case could leak raw marker text into the
  displayed plan — and the exact same bug class turned out to already
  exist, latent, in phase 4's `INTENDED_FILES` marker too, fixed at the
  same time. Not yet verified with a real live Claude call — today's
  rate limit was already exhausted by earlier work this session (14/10
  in Redis); verified instead via 12 unit-style parsing test cases plus
  the full UI/backend chain against directly-seeded data. See
  `docs/frontend-makeover-plan.md`'s "AI-suggested dependencies" section
  for the full detail, including the live-Claude verification still
  open until quota resets.
- Three previously-open items are now **resolved** by phases D/E, not
  just side effects: UI polish on the plan/chat panel (markdown
  rendering, real chat bubbles — Phase E), no visible `status` badge
  anywhere on a card (Phase D added it to every Kanban card; Phase 5
  already had it on graph nodes), and the "waiting forever" dependency-
  badge gap (Phase E's fourth badge state). Kept here, struck through in
  spirit, as a record that they were real and are now actually closed —
  not removed outright, in case a later session needs the history of
  what was wrong and when it got fixed.
- A larger design discussion (not yet started, explicitly deferred to
  after all of phases 4–7): AI-*suggested* (never auto-committed)
  dependency declarations, a per-feature-group context-summary layer to
  scope what gets fed to Claude, and AI-suggested ticket-to-group
  classification for newly created tickets. Thoroughly designed and
  self-critiqued already — real unresolved gaps found (no owner for an
  automated Claude call's rate-limit budget; a concurrency bug class this
  repo has already been bitten by twice, now in group-summary writes; a
  self-contradiction between "no schema change needed" and the
  suggestion needing to survive a page refresh; deletion of a completed
  group's context defeating its own future purpose; others). Deliberately
  not being built now — assessed, from an interview-portfolio standpoint
  at the user's experience level, as lower-value than finishing phases
  4–7 first, each of which has a cleaner, more provable "hard bug/fix"
  story. If revisited, build only the smallest slice (AI-suggested
  dependency) first, not the full three-feature stack.
- **`remaining-implementation-plan.md` has nothing left in it** — phase
  7a (the last item) finished this session. Nothing is "the next step"
  anymore; the items in this list and the deferred AI-suggestion design
  above are the only known unfinished threads.
- No test framework exists in this repo — verification has consistently
  been done via disposable `tsx` scripts, not a formal suite. This was a
  deliberate choice each time, not an oversight, but worth knowing if a
  future session considers introducing one.
