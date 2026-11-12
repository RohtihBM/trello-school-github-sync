# Remaining implementation plan (phases 3–7)

Concrete, numbered, buildable steps — same format as the phase 2 breakdown,
so each one can be executed, tested, and checked off independently. Builds
on the design already written in `github-integration-architecture.md`;
this file is the "how to actually build it" checklist, not a re-derivation
of the "why."

Not included: UI polish on phase 2 (markdown rendering, layout) — raised
separately, not yet scoped, tracked as its own follow-up rather than folded
into phase 3's steps below.

---

## Phase 3: Dependencies, cycle detection, contract diffing

**1. Schema — `Issue.status` was never actually migrated.**
Only ever existed in the original doc sketch (confirmed by checking the
real `schema.prisma` — it isn't there). This has to happen before anything
else in this phase, since "mark ticket B as DONE" and "ticket A is BLOCKED"
have nowhere to live without it.
```prisma
enum TicketStatus { OPEN PLANNING BLOCKED READY DONE }
// Issue gets: status TicketStatus @default(OPEN)
```

**2. Schema — `TicketDependency` model.**
```prisma
model TicketDependency {
  id              String  @id @default(cuid())
  blockedId       String  // waiting
  blockerId       String  // waited on
  assumedContract String?
  actualContract  String?
  mismatchFlag    Boolean @default(false)
  blocked  Issue @relation("DependentTicket", fields: [blockedId], references: [id], onDelete: Cascade)
  blocker  Issue @relation("BlockerTicket", fields: [blockerId], references: [id], onDelete: Cascade)
  @@unique([blockedId, blockerId])
}
```
Migrate both together, same `prisma migrate diff` → `migrate deploy` flow used for every migration so far (this environment's `migrate dev` doesn't work non-interactively).

**3. Backend — cycle-check helper, tested in isolation before wiring to a route.**
A pure function: given the existing dependency graph (all `TicketDependency` rows) plus a proposed new edge `(blockedId, blockerId)`, walk from `blockerId` forward through its own blockers looking for a path back to `blockedId`. If found, the new edge would create a cycle. Write this as a standalone function first and unit-test it with a hand-built graph (A→B→C→A) before it ever touches a route — a cycle bug found this way is cheap; found through the UI later is not.

**4. Backend route — `POST /issues/:id/dependencies`.**
Body: `{ blockerId, assumedContract }` — **not just `blockerId`**, caught by
re-checking against the source design: *"A's plan is required to state its
`assumedContract` about B."* Dropping this was a real omission — without
capturing it here, step 6's contract diff has nothing to ever compare
against (`assumedContract` would stay `null` forever, making the whole
diff feature a no-op). Explicit user input here, not parsed out of the
plan's freeform text — simpler and doesn't depend on fragile text parsing.
Checks: same org-membership gate as every other route, run the cycle check
from step 3, reject with a clear error if it would cycle, else create the
`TicketDependency` row (with `assumedContract`) and set the blocked
issue's `status` to `BLOCKED`.

**5. Define what actually sets a ticket to `DONE` — never specified until now.**
No mechanism for this exists anywhere in the app or earlier in this plan.
The natural, no-new-UI choice: the board already has a "Completed" section
users drag cards into (`move-issue`, already built). Extend
`handleMoveIssue` in `apps/Websockets/src/handlers.ts` — when the
*target* section's title is `"Completed"`, also set `status: "DONE"` in
the same update, instead of inventing a separate "mark as done" button.

**6. Worker/Backend — the contract diff, triggered by that `DONE` transition.**
When step 5's move sets a ticket to `DONE`, find every `TicketDependency`
where it's the `blocker`, and for each: extract `actualContract` (from
that ticket's own `plan`/chat — not a fresh Claude call, derivable from
data already in Postgres), diff against `assumedContract`, set
`mismatchFlag` if they differ, broadcast a notification to the blocked
ticket (reuse `notifyBoard`, no new transport). **Then — the piece
dropped when this plan was first condensed from the architecture doc**:
check whether the blocked ticket (A) now has zero remaining non-`DONE`
blockers; if so, set A's status to `READY`. Without this, `BLOCKED` has no
way back out anywhere in this plan.

**7. Frontend — the dependency section in `PlanPanel`, missing until now.**
Another drop caught by re-checking against the "UI additions" section of
the architecture doc, which explicitly calls for this: a way to declare a
dependency (pick another ticket on the board, enter `assumedContract`),
and a display of `assumedContract`/`actualContract`/`mismatchFlag` once
the blocker resolves. Without this, every backend piece in steps 1–6 would
be real and working, with no way for a human to actually use any of it.

**8. Verify end-to-end.** Create two real tickets, declare A depends on B
**through the actual UI**, confirm the cycle check rejects the reverse
edge, drag B into Completed, confirm B is now `DONE`, the contract diff
ran, A's status flipped to `READY`, and the mismatch (if any) is visible
on screen — not just correct in the database.

---

## Phase 4: File-overlap warnings

**1. Backend — a query, not a model.** No new schema needed — `Issue.intendedFiles` already exists (migrated back in phase 2, just never used yet). A function: given a `boardId` and a list of files, find every other `OPEN`/`PLANNING`/`BLOCKED` issue on that board whose `intendedFiles` intersects.

**2. Wire it into plan generation.** After `Worker` writes a new `plan`/`intendedFiles` (in `processPlanJob.ts`), run the overlap check and include the result in the `plan-ready` broadcast (or a new, small message type) rather than inventing a separate round-trip.

**3. Frontend — a warning banner**, not a block. Surface it in `PlanPanel`, next to the plan — this is explicitly a human decision point, never an automatic rejection (file/module granularity only, per the architecture doc — no real code exists yet at plan time to predict line-level conflicts).

**4. Verify.** Two tickets on the same board, both with plans declaring the same file in `intendedFiles` — confirm the warning actually appears for both, and that two unrelated tickets never show one.

---

## Phase 5: Dependency graph UI

**1. Install `@xyflow/react` and `dagre`** into `apps/Frontend`.

**2. A new route/page**, e.g. `/boards/:boardId/graph` — nodes from the board's issues, directed edges from `TicketDependency` rows (fetch via a new simple `GET /boards/:id/dependencies` route).

**3. Run `dagre` for layout** before handing positions to React Flow — don't hand-position nodes.

**4. Confirm the cycle-prevention from phase 3 holds here too** — this view should only ever need to render a DAG, never a loop, by construction.

---

## Phase 6: Hash-chained approvals

**1. Schema — `ApprovalRecord`.**
```prisma
model ApprovalRecord {
  id           String   @id @default(cuid())
  issueId      String
  approvedById String
  contentHash  String
  previousHash String?
  createdAt    DateTime @default(now())
}
```

**2. Backend route — `POST /issues/:id/approve`.** Compute `sha256(issue.plan)`, look up the board's (not the ticket's — chaining per-board is simpler and still makes any tampering detectable) most recent `ApprovalRecord`, write the new one with `previousHash` pointing at it.

**3. A verification script**, not UI — walk the whole chain for a board and confirm each record's `previousHash` matches the prior record's `contentHash`. This is the actual point of the feature; it should be provably checkable, not just trusted by construction.

**4. Frontend — the "Approve" button, missing until now.** Same category
of drop as phase 3's: the architecture doc's "UI additions" section
explicitly calls for this in the per-ticket page. Without it, step 2's
route has no way to actually be triggered by a person using the app.

**5. Verify by deliberately breaking it once** — hand-edit one historical `contentHash` in the database and confirm the verification script actually detects the break, the same "prove the fix by reproducing the failure first" discipline used throughout phase 2.

---

## Phase 7a: Redis Pub/Sub for `Websockets` scaling

Explicitly the one item still being built ahead of real need, for the
learning value, not because anything up to this point requires it with a
single `Websockets` instance.

**1. Move presence metadata into Redis** — `HSET board:{boardId}:users`, written on join/leave, read instead of the local `boardRooms` map when answering "who's online."

**2. Publish every broadcast-worthy event to a Redis channel** (`board:{boardId}`) instead of calling `broadcastToBoard` directly inline.

**3. Every instance subscribes to that channel** and calls the existing (unchanged) `broadcastToBoard` only for its own locally-held sockets.

**4. The actual proof**: run two local `Websockets` instances on different ports, put one test user on each, and confirm an action by user A (connected to instance 1) is seen live by user B (connected to instance 2) — the exact failure this phase exists to fix.

---

## Suggested order

Phase 3 before 4 (4 depends on `intendedFiles`, already true, but 3's
schema work — particularly `Issue.status` — is a clean prerequisite to get
right first). Phase 5 after 3 (needs real dependency data to render
against). Phase 6 is the most isolated — could run anytime after phase 2,
including before 3–5 if preferred. Phase 7a last, as already decided.
