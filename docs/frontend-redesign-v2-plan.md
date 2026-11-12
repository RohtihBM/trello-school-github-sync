# Frontend redesign v2 — implementation plan

> **Status: Phase 1 complete and live-verified (2026-11-12). Phase 2
> starting next.** (Phase 3's content split already done as a
> carry-over from before this plan existed — see below.) Written
> after the original 8-phase makeover (`frontend-makeover-plan.md`,
> phases A–H, complete) and two post-makeover additions (the `BoardView`
> right-panel/full-view redesign, AI-suggested dependencies). This is a
> second, larger pass, specified in full by the user as a pasted product
> vision doc. That doc is the north star for every phase below; this
> file adds only what needed grounding in the actual current code/schema
> before implementation could start, plus a running status log.

## North star (user-provided, verbatim intent)

A polished, Linear/GitHub-Projects-grade developer collaboration
platform. Core principle: **AI assists developers; developers remain in
control** — the interface must make that distinction obvious everywhere
(suggestions, never auto-commits; explicit approval; explicit expand/
collapse). Visual identity: Geist Sans/Mono, neutral surfaces, one
restrained accent, no gradients/glassmorphism, compact and
information-dense — i.e. tighten and extend the existing design system
(`apps/Frontend/src/components/ui/`), not replace it.

Full section-by-section detail (application shell/sidebar, `BoardsList`
dashboard, `BoardView` board experience, `IssueDetailPanel` redesign,
`GraphView`, auth pages, responsive, accessibility, implementation
sequence, strict rules) is the user's own pasted document from this
conversation — treat it as authoritative for exactly what each screen
should contain; this file does not restate it, only what had to be
resolved before building it.

## Two things resolved before implementation, not assumed

1. **Issue-selection behavior, corrected — then explicitly reversed
   again (2026-11-12).** An earlier message asked for "selecting a card
   transitions to full view directly." The pasted plan (Section 5)
   then overrode that with "docked panel on select, full view only via
   an explicit expand button," which is what Phase 1 shipped and
   verified. During Phase 2 planning, the user explicitly asked again
   for a card click to open a popup/dialog directly — not the docked
   panel — showing only that ticket's title, description, and chat.
   Flagged the conflict with the already-shipped behavior and got
   explicit confirmation before changing it (picked "Switch to
   popup/dialog on click" over keeping the docked panel). Implemented:
   `BoardCard` `onSelect` now opens the full-view `Dialog` directly;
   the docked `IssueDetailPanel` component and the `compact` layout
   branch of `IssueDetailContent` are deleted (dead code, had no other
   caller) rather than left unused. The complete-view dialog is now the
   only detail surface a card click leads to.
2. **Real backend gaps, found by checking the actual schema/routes, not
   assumed** — confirmed with the user to build real support for all of
   these rather than fake any of them (the plan's own rule: "Do not
   introduce mock functionality into production screens"):
   - `Board` has no `description` column at all (`id`, `title`, `orgId`,
     timestamps only).
   - `GET /boards` returns bare board rows — no issue count, no member
     list.
   - `IssueMapping` (the user↔issue assignment model) exists in the
     schema but is referenced by **zero** routes anywhere in the
     codebase — no way to assign anyone today, this is a genuinely new
     feature, not a display tweak.
   - `GraphView`'s `<ReactFlow>` has no `onNodeClick` — nodes are
     static styled boxes today, not interactive.
   - A sidebar doesn't exist anywhere — every authenticated page
     currently uses a plain per-page `<header>`. Confirmed to add it now
     (Section 3), as its own Phase 1 item alongside the dashboard work
     the pasted plan already groups it with.

## Carry-over already done (before this plan existed)

`PlanPanel` was already split into `TicketDetailsPane.tsx` (plan,
approve, dependencies, suggestions, file-overlap warnings — Sections A,
C, D, E, F of the pasted plan's `IssueDetailPanel` spec) and
`ChatPane.tsx` (Section B), orchestrated by `IssueDetailContent.tsx` with
a `layout: "compact" | "full"` prop (stacked vs. side-by-side). This
already satisfies most of what Phase 3 below asks for structurally; Phase
3 is mostly refinement of what's already split apart, not a rebuild.

## Phased plan (matching the pasted plan's Section 11 exactly)

**Phase 1 — Application shell and dashboard. [DONE, verified live]**
- New sidebar (product mark, Boards, Organisations, Settings, user
  menu), compact, consistent across authenticated pages.
- Backend: `Board.description String?` (migration); `GET /boards`
  extended to include issue count + org member list (a join, not N+1
  queries per board). New `GET /me` for the sidebar's user row.
- `BoardsList` rebuilt per the pasted plan's Section 4: header with
  search, organisation section, board grid (name, description, issue
  count, member avatars, last-updated, context menu), proper empty
  states for zero-orgs/zero-boards.
- Verified live: `/me` and extended `/boards` confirmed via direct
  requests against the running Backend; search filtering, sidebar
  active-state, rename-via-dropdown persistence, `OrganisationsPage`,
  `SettingsPage`, and `BoardView` rendering inside the new `AppShell`
  all confirmed by the user in the actual browser. Dev-environment
  note: Backend/Websockets run as plain `tsx watch` in separate
  terminal tabs with no supervisor — either can die independently
  (closed tab, machine sleep, or a Neon cold-start error) and needs a
  manual restart; this caused several false-looking failures during
  verification that were actually just a dead process, not a code bug.

**Phase 2 — Board experience.**
- `BoardView` header per Section 5 (board description, collaborator
  avatars, board actions).
- Backend: an assignment route (`POST`/`DELETE` on `IssueMapping`) +
  card UI to show/set an assignee avatar.
- Drag-and-drop feedback polish (elevation, drop-target highlight,
  success/failure feedback) — mostly already built in the earlier
  `BoardView` redesign; audit against the pasted plan's specific asks.

**Phase 3 — Issue detail experience. [DONE]**
- Refine `TicketDetailsPane`/`ChatPane` (already split) against the
  pasted plan's Section 6 point by point — scannable plan formatting,
  chat composer fixed at the bottom, consistent warning/status design,
  approval section visual weight.
- "Depends on" given its own card, mismatch state made loud (done
  mid-session, see below).
- Plan markdown: headings now get a border-left accent + real
  size/weight jump from body text (`TicketDetailsPane.tsx`) — the
  concrete fix for "scannable," since a plan with several sections used
  to read as one undifferentiated block.
- Chat composer: added explicit `shrink-0` so "fixed at the bottom" is
  stated outright, not just an accident of default flex behavior.
- Approval: no longer a small inline button next to the status badge —
  its own card with a one-line explanation of what approving actually
  unlocks (the Completed-column gate), a full-width primary button, and
  a distinct "Plan approved" success state once `status` is `READY`/`DONE`
  instead of showing a re-clickable button forever.

**Phase 4 — Dependency graph.**
- `onNodeClick` → navigate to the board with that issue selected.
- Hover detail, incoming/outgoing edge distinguishability, legibility
  at higher node counts.

**Phase 5 — Authentication and responsive polish. [DONE]**
- Auth pages (`SignIn`/`SignUp`/`AuthShell`) checked against the plan —
  already solid from the original makeover (field-level validation,
  loading state, shared shell); no changes needed.
- Sidebar now collapses on mobile: hidden by default below `md`, opened
  via a hamburger button in `AppShell`'s new mobile top bar, slides in
  as an overlay drawer with a dismissible backdrop, closes itself on
  any navigation (including deep links from the graph view, not just
  its own nav links).
- Issue detail dialog goes full-screen below `sm` (no floating box on
  an already-small screen) and its Details/Chat split stacks into two
  equal rows instead of squeezing two columns.
- `BoardView`'s header and `BoardsList`'s header both reflowed for
  phone width: text labels drop to icon-only / hidden below `sm`
  (board header), and the title/search/action row stacks vertically
  instead of three things fighting for one row (`BoardsList`).

**Phase 6 — Final verification. [DONE]**
- Playwright + `@axe-core/playwright` already real installed deps in
  this repo (`apps/Frontend`, `apps/Worker`) — wrote and ran an actual
  script against the live app (no dedicated browser tool in this
  session, so driven directly) covering every page: SignIn, SignUp,
  BoardsList, BoardView, the full-view ticket dialog, GraphView,
  Organisations, Settings, plus a mobile-viewport pass.
- First axe run found one real, fixed bug: the ticket dialog had no
  accessible name (`aria-dialog-name`) — `IssueDetailContent.tsx`'s
  title was a plain `<p>`, not a real Radix `DialogTitle`, so the
  dialog had nothing to point `aria-labelledby` at. Re-ran after the
  fix: 0 violations across all 9 pages/states, 0 browser console errors
  the whole run.
- A screenshot also caught a timing false-start (board content
  appeared blank at an 800ms wait) — re-verified with a longer wait
  before concluding anything; the actual render is correct, confirmed
  visually (3 columns, real tickets, `PLANNING` status badge in "In
  Progress," `DONE` in "Completed" — Phase 2/3's nomenclature fixes
  genuinely working together, not just type-checking).
- `tsc --noEmit`: clean across all 4 apps + `packages/db`.
- `vite build` caught a second real bug `tsc` had missed: duplicate
  `h1`/`h2`/`h3`/`p` keys in `TicketDetailsPane.tsx`'s markdown
  `components` object (Phase 3's heading-styling edit added a new set
  without removing the old one) — fixed.
- Bundle-size check: 890KB main chunk (285KB gzip), over Vite's 500KB
  warning threshold. `@xyflow/react` + `dagre` (graph-only deps) were
  the biggest single contributor — lazy-loaded `GraphView` via
  `React.lazy`/`Suspense` in `App.tsx`, cutting the main chunk to 605KB
  (190KB gzip, a 32% reduction) with the graph library now only loaded
  when that route is actually visited. The remaining ~605KB is React +
  Radix UI + `dnd-kit` + `react-markdown` + the app itself — reasonable
  for this feature set, not pursued further without a concrete reason.

All six phases of this redesign are now complete.

## Decided mid-Phase-3 (2026-11-12): GitHub is the only ticket-creation path

User flagged a real incoherence while testing: a ticket could be dragged
straight to "Completed" (-> `DONE`) with no plan and no approval at all,
and separately asked whether the AI-plan/chat/approval pipeline is "an
additional feature" on top of an otherwise-independent manual board.
Per this project's own stated purpose (the kanban board is "just the
substrate" for GitHub-sync -> AI plan -> human approval), the answer is
no — the plan pipeline should drive status, not coexist with an
unrelated manual one. First concrete step: removed in-app issue creation
entirely (deleted `AddForm.tsx`, the quick-add box, and the
`"create-issue"` WebSocket message type server-side) — GitHub's webhook
upsert is now the only way a ticket can ever be created, enforced at the
protocol level, not just hidden in the UI.

**Status-nomenclature fixes — done.** Clicking "Generate plan" now flips
`OPEN` -> `PLANNING` and auto-moves the card to "In Progress"
immediately, not once the slow job finishes
(`apps/Backend/src/routes/plan.ts`). Moving a card to "Completed" is now
gated behind a real `ApprovalRecord` existing for that ticket (and no
open blockers) — `apps/Websockets/src/handlers.ts`'s `handleMoveIssue`
rejects the move otherwise and tells the frontend the issue's real
section to revert the optimistic drag back to.

**GitHub is the only ticket-creation path — done.** Deleted the in-app
"New issue" quick-add (`AddForm.tsx`, `BoardColumn.tsx`'s prop) and the
server-side `"create-issue"` WebSocket message type entirely. Tickets
only ever enter the system through `apps/Backend/src/routes/github.ts`'s
webhook upsert now, enforced at the protocol level.

**Dependency-finding restructured into its own pre-planning step —
done.** Previously one Claude call produced both the plan AND an
optional dependency suggestion together. Per discussion: Claude's
dependency decision stays human-confirmed (never auto-committed — the
project's core principle holds), but is now checked and surfaced FIRST,
pausing before any plan gets written, rather than appearing alongside an
already-written plan.
- New `processDependencyCheck` job (`apps/Worker/src/processPlanJob.ts`)
  runs first on every "Generate plan" click — a deliberately cheap call
  (no repo clone, no tools, just ticket text) asking only "does this
  depend on another ticket?". If yes: writes `suggestedDependency` and
  stops; the UI replaces the "Generate plan" button entirely with a
  "resolve this before planning" banner (confirm commits in one click,
  dismiss clears it) — no `onSelect`-level choice is skipped, just
  reordered to happen first. If no: auto-enqueues the real
  `generate-plan` job itself, no second click needed.
- Confirming or dismissing the suggestion (`apps/Backend/src/routes/dependency.ts`)
  auto-continues into the real plan generation the same way, when (and
  only when) it's resolving this specific pre-plan pending state —
  a manually-declared dependency on a ticket that already has a plan is
  unaffected, same as before.
- Correction made along the way: the per-call cost estimate I gave before
  building this (per-token API pricing) was wrong — this project's
  Claude calls run through a subscription-based Claude Code CLI login,
  not a metered `ANTHROPIC_API_KEY`, confirmed by inspecting the actual
  running Worker process's environment. There's no meaningful per-call
  dollar cost to quote; the real tradeoff is one more Agent SDK call per
  click against the subscription's own usage, accepted as fine for a
  learning/portfolio project.

## Explicitly not decided yet

Nothing outstanding — both open questions (backend-gap handling,
sidebar timing) were resolved before this doc was written. Ready to
start Phase 1 on confirmation.
