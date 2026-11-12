# GitHub integration: target architecture

This is the concrete system we've decided to build, consolidating every
design decision made while discussing [production-blockers.md](./production-blockers.md).
It supersedes the original "auto-generate code and auto-push" idea — that
was deliberately scoped down, for the reasons recorded below.

## What changed from the original idea, and why

| Original idea | What we're building instead | Why |
|---|---|---|
| AI writes code and pushes it automatically | AI generates an **implementation plan**, discussed in a per-ticket chat; no code is generated or pushed | Removes the single highest-risk item from the blockers doc entirely — an AI agent with repo write access. No push credential exists anywhere in this design |
| Every ticket's chat is aware of every other ticket | Explicit, human-declared **dependency links** between tickets, plus **declared intended files**, with narrow event-driven updates (not live, not full-context) | Full mutual awareness is quadratic in cost and reopens a sync problem we already solved once (board presence). The real needs ("don't plan against a thing that doesn't exist yet," "don't silently conflict on the same file") are each solved by something much smaller |
| "Generate the optimal prompt" | Dropped | Not a distinct, measurable artifact from the plan itself — there's no way to score prompt "optimality" without running codegen, which we're deliberately not doing |

Net effect: **no GitHub write access is needed by the agent at all** in this
version. The GitHub App only needs read access (issues, repo contents) plus
the ability to write *back* issue comments/labels if we choose to mirror
status there later. This removes the hardest blocker category
(enforcing the approval gate against prompt injection) from the critical
path — there's nothing destructive to gate yet, by design.

---

## Data model additions (`packages/db/prisma/schema.prisma`)

All additive — nothing here changes the existing Board/Section/Issue model,
it extends `Issue` and adds new models alongside it.

```prisma
model Issue {
  // ...existing fields...
  githubNodeId     String?  @unique   // GitHub's permanent id; null for issues created in-app
  plan             String?            // the current AI-generated plan, as markdown
  intendedFiles    String[]           // files/modules this plan declares it will touch
  claudeSessionId  String?            // lets chat `resume` the same session instead of starting fresh
  status           TicketStatus @default(OPEN)

  dependsOn        TicketDependency[] @relation("DependentTicket")
  dependents       TicketDependency[] @relation("BlockerTicket")
  planMessages     PlanMessage[]
  approvals        ApprovalRecord[]
  planJobs         PlanGenerationJob[]
}

// Pulled forward from what was originally phase 7b — see "Why the job queue
// moved earlier" below. One queued/running job per ticket at a time.
model PlanGenerationJob {
  id            String    @id @default(cuid())
  issueId       String    @unique
  requestedById String
  status        JobStatus @default(QUEUED)
  attempts      Int       @default(0)
  error         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  issue       Issue @relation(fields: [issueId], references: [id], onDelete: Cascade)
  requestedBy User  @relation(fields: [requestedById], references: [id])
}

enum JobStatus {
  QUEUED
  RUNNING
  SUCCEEDED
  FAILED
}

enum TicketStatus {
  OPEN
  PLANNING
  BLOCKED       // has an unresolved dependency
  READY         // plan approved, no open blockers
  DONE
}

// A -> depends on -> B. Enforced to stay a DAG at creation time (app-level check).
model TicketDependency {
  id               String  @id @default(cuid())
  blockedId        String  // the ticket that is waiting
  blockerId        String  // the ticket it's waiting on
  assumedContract  String? // what the blocked ticket's plan assumed about the blocker
  actualContract   String? // filled in once the blocker is marked DONE
  mismatchFlag     Boolean @default(false) // true if assumed/actual diverge

  blocked  Issue @relation("DependentTicket", fields: [blockedId], references: [id], onDelete: Cascade)
  blocker  Issue @relation("BlockerTicket", fields: [blockerId], references: [id], onDelete: Cascade)

  @@unique([blockedId, blockerId])
}

// The per-ticket planning chat.
model PlanMessage {
  id        String   @id @default(cuid())
  issueId   String
  role      String   // "user" | "assistant"
  content   String
  createdAt DateTime @default(now())

  issue Issue @relation(fields: [issueId], references: [id], onDelete: Cascade)

  @@index([issueId])
}

// Tamper-evident approval log: each record's hash includes the previous
// record's hash, so editing history is detectable, not just logged.
model ApprovalRecord {
  id            String   @id @default(cuid())
  issueId       String
  approvedById  String
  contentHash   String   // hash of the exact plan content being approved
  previousHash  String?  // the prior ApprovalRecord's hash in the chain
  createdAt     DateTime @default(now())

  issue      Issue @relation(fields: [issueId], references: [id], onDelete: Cascade)
  approvedBy User  @relation(fields: [approvedById], references: [id])
}
```

---

## Event flows

### 1. GitHub issue → ticket (idempotent sync)

```
GitHub "issues" webhook (opened/edited/closed)
  → verify HMAC signature (reject if invalid)
  → upsert Issue on githubNodeId (never plain create — see production-blockers.md §1)
  → broadcast the change to the board's WebSocket room (reuses existing rooms.ts/broadcastToBoard)
```

Reuses the `Websockets` app's existing presence/broadcast machinery — a
ticket appearing live on an open board is the same mechanism as an issue
move appearing live, just a different message type.

### 2. Plan generation (user-initiated, queued, rate-limited)

**Deliberately a button the user clicks**, not something that fires the
instant a ticket is created. This is the cost-control decision from the
blockers doc (§3 "bound cost") made concrete: nothing billable happens
until a human asks for it.

**Why the job queue moved here from phase 7:** originally deferred as a
"scale it later" concern. Reconsidered — it's directly motivated by this
exact phase (a real plan-generation call is slow, not the ~2.3s trivial
test we measured), and it was already independently ranked as one of the
highest-learning-value pieces in this whole project. Building it against a
real, felt problem now beats retrofitting it onto an already-working
synchronous version later. Rate limiting (§7c, also pulled forward) comes
along with it almost for free once the queue exists.

```
User clicks "Generate plan" on a ticket
  → check Redis counter ratelimit:plan-gen:{userId}:{today} (INCR + 24h EXPIRE)
    → over the daily cap? reject here, before anything is created or billed
  → create a PlanGenerationJob (QUEUED), NOT a direct Claude call
  → enqueue the job id on a Redis-backed queue (BullMQ)
  → respond immediately; UI shows "generating..."

A separate worker process (new: apps/Worker) picks up the job:
  → marks it RUNNING
  → ensures the shared local clone of the connected repo is up to date
    (git pull — this is the one clone every ticket's plan generation reads
    from, not one clone per ticket; see below for why)
  → calls query() from @anthropic-ai/claude-agent-sdk:
      - prompt: the issue's title + body
      - options.cwd: the local repo clone's path
      - options.allowedTools: ["Read", "Grep", "Glob"]  (read-only, nothing to push)
      - options.model: pinned to a cheap model (Haiku) — defaulting to Opus
        costs ~4.5x more for identical work, confirmed by direct measurement
  → on success: writes Issue.plan, Issue.intendedFiles, Issue.claudeSessionId
    (the SDK's session id — needed so chat can `resume` it, see §3),
    marks the job SUCCEEDED, broadcasts the new plan live (reuses phase 1's
    Backend → Websockets internal-broadcast mechanism, unchanged)
  → status moves OPEN -> PLANNING
  → on failure: BullMQ's built-in retry/backoff; after N attempts, mark
    FAILED and surface the error in the UI rather than retrying forever
```

**One shared repo clone, not one per ticket.** Every ticket is asking the
same question — "given the *current* state of this code, what's a sensible
plan?" — so all tickets correctly read the same single checkout. (Per-
ticket isolated workspaces was a real requirement for the auto-push version
we deliberately cut; since nothing here ever writes, there's nothing to
isolate.) The one real subtlety: a `git pull` running concurrently with
another ticket's in-flight read could hand that read an inconsistent mix of
old/new files. Mitigated by pulling only when a new ticket arrives via the
webhook (§1), not on every single "Generate plan" click — the repo isn't
changing every few seconds, so this is a cheap, sufficient guard.

### 3. Per-ticket chat (resumes the same Claude session)

Each `PlanMessage` is a turn in a conversation scoped to one ticket —
a persisted chat thread (user + assistant messages, in order), rendered in
its own panel per ticket.

**Why it reuses the session instead of starting fresh each message:** the
same per-call overhead measured for plan generation (~23,000 fixed tokens,
independent of task) would otherwise be paid again on *every single chat
message*, and a fresh session would have also forgotten the repo it already
read. The SDK supports resuming a specific prior session:

```
User sends a chat message
  → enqueue the same way as plan generation (job queue, rate-limited)
  → worker calls query({ prompt: message, options: { resume: issue.claudeSessionId, ... } })
  → appends both the user's message and the reply as PlanMessage rows
  → broadcasts the new messages live
```

### 4. Declaring a dependency (human action, cycle-checked)

```
User marks "ticket A depends on ticket B"
  → before saving: walk B's existing dependency graph looking for a path back to A
  → if found, reject ("this would create a cycle")
  → else create TicketDependency { blockedId: A, blockerId: B }
  → A's status becomes BLOCKED
  → A's plan is required to state its `assumedContract` about B
```

### 5. Dependency resolves → contract diff (not a full-context share)

```
User marks ticket B as DONE
  → for every TicketDependency where blockerId = B:
      extract B's actualContract (from B's final plan/discussion, not B's whole transcript)
      store it on the TicketDependency row
      diff it against assumedContract
      if they differ: set mismatchFlag = true, notify the blocked ticket's owner
      ("B shipped — your assumption about it may be stale, re-review")
  → if a blocked ticket (A) has no remaining unresolved dependencies, A's status -> READY
```

This is the one-time, one-directional, narrow update discussed earlier —
never a standing connection between two tickets' chats.

### 6. File-overlap warning (planning-time, coarse-grained)

```
When a plan declares `intendedFiles`:
  → query other OPEN/PLANNING/BLOCKED tickets on the same board
  → compare intendedFiles lists
  → on overlap, surface a warning in the UI (not a block — a human decision point)
```

Explicitly file/module granularity, not line granularity — no real code
exists yet at plan time, so line-level conflict prediction isn't
possible (see production-blockers.md §9).

### 7. Approval (hash-chained)

```
User approves the current plan
  → contentHash = sha256(plan text)
  → previousHash = this ticket's (or the board's) most recent ApprovalRecord's hash
  → write ApprovalRecord { contentHash, previousHash, approvedById }
```

Chaining per-board (every approval on the board extends one chain) is
simpler to implement and verify than per-ticket chains, and still makes
tampering with *any* past approval detectable — breaking one link breaks
everything after it in the chain.

---

## UI additions (`apps/Frontend`)

- **Per-ticket page**: plan (rendered markdown) + chat panel (`PlanMessage` list + input) + dependency section (declare a dependency, see assumed/actual contract once resolved, see mismatch flags) + file-overlap warnings + an "Approve" button.
- **Dependency graph view**, one per board: nodes = tickets, directed edges = "depends on." Built with **React Flow** (`@xyflow/react`) for rendering/interaction and **dagre** for automatic layout (no manual node positioning). Cycle prevention from flow §4 means this is always guaranteed to render as a DAG, never a loop.

---

## Infrastructure now required (vs. the project's current state)

- A **public, HTTPS-reachable Backend** to receive the GitHub webhook — `localhost` cannot receive it. For early development/demos, a tunnel tool (e.g. `ngrok`) pointed at the local dev server is a reasonable stepping stone before real hosting. **Done, phase 1.**
- A registered **GitHub App** (read-only scope: issues, repo contents — no write/push permission is needed by this version at all). **Done, phase 1.**
- `GITHUB_WEBHOOK_SECRET` for signature verification, alongside the existing `JWT_SECRET` pattern in `apps/Backend/.env`. **Done, phase 1.**
- **Redis** — needed starting phase 2, pulled forward from what was originally phase 7 (see §2). Backs the job queue (BullMQ) and the rate-limit counter.
- **A new `apps/Worker` app** — the background process that actually runs `query()` jobs, separate from the request-serving `Backend`. Mirrors how real companies separate web-serving processes from background-job processes.
- **A local clone of the connected repo**, on disk, kept up to date with `git pull` — needed so the agent's `Read`/`Grep`/`Glob` tools have something to read (they operate on the filesystem via `cwd`, not GitHub's API).

---

## Scaling and operational concerns (system design)

Read replicas, a CDN, and load-balancing plain stateless Backend instances
are still skipped: there's no real load that motivates them, and adding
them anyway would be decoration, not substance. The job queue and rate
limiting that used to live here moved to phase 2, because they turned out
to be genuinely needed there, not hypothetical.

What's left below (7a) is different in kind: nothing in this project
*requires* it yet — it solves a problem (multiple `Websockets` instances)
that doesn't exist with one instance. It's kept as an explicit, acknowledged
choice to build it ahead of real need, purely for the learning — the
project's stated purpose is a resume/credibility piece, not a product
under real load, so this is a conscious tradeoff, not an accident.

### 7a. Redis Pub/Sub for horizontal scaling of `Websockets`

**The problem, concretely:** `rooms.ts`'s `boardRooms` map lives in **one
process's memory**. Run two `Websockets` instances behind a load balancer
today, and a user connected to instance A and a user connected to instance
B, on the same board, will never see each other's updates — instance A has
no way to know instance B's room even exists. This is the textbook reason a
naive in-memory real-time service can't scale past one process.

**The fix:** move the *fact* of who's online into Redis (shared, visible to
every instance), while each instance still holds the *actual socket
objects* locally — because, as established early in this project, a live
socket can never be stored anywhere outside the process that physically
holds that TCP connection; Redis can only ever hold *metadata about* it.

```
On join:
  → add the user to this instance's LOCAL boardRooms map (holds the real socket)
  → write presence metadata to Redis: HSET board:{boardId}:users {userId} {email}
  → subscribe to Redis channel board:{boardId} if not already subscribed

On any broadcast-worthy event (issue created/moved/deleted, user joined/left):
  → PUBLISH the message to board:{boardId}  (every instance publishes, none skip this)

Every instance's subscriber, on receiving a message from board:{boardId}:
  → calls the existing broadcastToBoard(boardId, message) UNCHANGED,
    which sends only to the sockets THIS instance physically holds for that board

On "who is online" (served at join time):
  → read from the Redis Hash (the full cross-instance list), not the local map
    (the local map alone only shows who's connected to THIS instance)

On close:
  → remove from the local map, HDEL from Redis, publish "user-left"
```

`broadcastToBoard` itself barely changes — it's now *triggered by* a Redis
subscription callback instead of being called directly inline, but it still
only ever touches local sockets. This is the same pattern Socket.IO's own
Redis adapter uses in real products.

**A nice side effect:** once presence is Redis-backed, a load balancer in
front of `Websockets` doesn't need sticky sessions for reconnects — any
instance can correctly serve any client, because no instance is the sole
source of truth for who's online anymore.

### 7b/7c. Job queue + rate limiting — moved to phase 2

These used to live here. Reconsidered: both are now built as part of
**phase 2** (see event flow §2) rather than deferred — the job queue
because it's directly motivated by what phase 2 itself requires (Claude
calls are genuinely slow), not a hypothetical future scale problem, and
rate limiting because it's a cheap addition once the queue and Redis exist
anyway. See §2 for the concrete mechanics of both.

**Defense in depth on the webhook endpoint, still worth doing whenever §1's
infra is revisited:** GitHub's signature check already rejects forged
requests before any real work happens, but a basic per-source-IP rate limit
on the raw endpoint is worth having regardless — verifying a signature
still costs a little CPU per request, and the endpoint is, by definition,
reachable by anyone on the internet.

---

## Suggested build order

1. ✅ **Ticket sync**: GitHub App (read-only) + webhook receiver + idempotent upsert. Done, verified working end-to-end with real GitHub issues.
2. ✅ **Plan generation + chat**: Redis, the `PlanGenerationJob` queue (`apps/Worker`), rate limiting, the shared local repo clone, `claudeSessionId`-based chat continuity, the full UI (plan display, chat panel). Done, verified end-to-end with real Claude calls — including one genuinely serious finding (tool restriction wasn't actually restricting anything — see the inline comments in `processPlanJob.ts` for the fix). Known follow-up, not yet done: the UI is functional but visually rough (plan text isn't rendered as markdown, panel is cramped) — tracked as its own item below, not blocking phase 3.
3. **Dependencies + cycle check + contract diff**: `TicketDependency` model, the declare-dependency UI, the DONE-triggered diff flow.
4. **File-overlap warnings**: the simplest of the remaining pieces, built on `intendedFiles` already captured in step 2.
5. **Dependency graph UI**: React Flow + dagre, now that there's real dependency data to render.
6. **Hash-chained approvals**: `ApprovalRecord`, last because it's the smallest, most isolated piece and benefits from having real plans/approvals already flowing through the system to test against.
7. **Redis Pub/Sub for `Websockets` scaling (7a)** — the one piece deliberately still last, since it's a learning-driven addition built ahead of real need, not a correctness fix for something steps 1–6 actually require.

Each step is independently demoable, which matters for a learning project —
you get a working, explainable increment after every stage rather than one
large all-or-nothing build.
