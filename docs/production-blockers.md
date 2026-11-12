# Production blockers: GitHub → AI codegen → auto-push pipeline

This documents every real-world obstacle standing between "the idea" (GitHub
issue → auto-generated code → auto-pushed PR, with human approval gates) and
a system that's actually safe to point at a real repository. No solutions
here on purpose — just a clear-eyed map of what breaks, and why it's hard,
grouped by the stage of the pipeline it affects.

```
1. GitHub issue opened
        │  WEBHOOK
        ▼
2. Backend creates a ticket
        ▼
3. Agent (Claude Code + GitHub MCP) reads the issue, proposes a PLAN
        ▼
4. ⏸ human approves the plan
        ▼
5. Agent writes the code on a branch
        ▼
6. Agent opens a PR
        ▼
7. ⏸ human approves push/merge
        ▼
8. Merged
```

---

## 1. The trigger (webhook) stage

**Webhook delivery is not reliable the way a normal function call is.**
GitHub retries failed deliveries, which means your endpoint can receive the
*same* "issue opened" event more than once. If ticket creation isn't
idempotent, one GitHub issue silently becomes two tickets on your board.

**Anyone who can open an issue can trigger your pipeline.** On a public
repo, that's the entire internet. There's no built-in concept of "only
trusted people's issues start the AI" unless you build it — meaning a
stranger can currently be the one who kicks off real API spend and a real
AI agent run, just by opening an issue.

**Your backend has to be reachable from the public internet.** Right now
everything in this project runs on `localhost`. GitHub cannot deliver a
webhook to a laptop behind a home router. This means real hosting, a real
domain, and TLS — not optional infrastructure, a hard precondition for step
1 to ever fire at all.

**Signature verification is mandatory, not a nice-to-have.** Without
verifying GitHub's HMAC signature on every webhook payload, anyone who
discovers your endpoint URL can send a fake "issue opened" payload and make
your system believe a ticket exists and start generating/pushing code for
content they made up entirely.

**Events can arrive out of order or overlap.** "Issue opened" and "issue
edited two seconds later" can race. A naive handler might process the edit
before the create, or process both concurrently and corrupt the ticket's
state.

---

## 2. Auth & permissions (GitHub side)

**A GitHub App, not a personal token, is the right primitive — and it's
more moving parts.** It needs a private key (long-lived, extremely
sensitive), issues short-lived (1 hour) installation tokens that must be
refreshed, and is installed per-repo/per-org, meaning your system needs to
track *which* installation maps to *which* board/repo.

**The permission scope is the whole blast radius of this project.** To push
code, the credential needs write access to the repository. That is
simultaneously the entire point of the system and its single biggest risk:
whoever/whatever controls that credential can modify the real codebase.
There's no scope setting that says "write access, but only for AI-generated
PRs that a human approved" — that constraint has to be enforced entirely in
your own code, GitHub has no concept of it.

**Secrets management becomes a real discipline, not a `.env` file.** The
App's private key, the webhook secret, and any installation tokens in flight
all need protecting at a level beyond what this project has needed so far
(recall `JWT_SECRET` living in a plain `.env` — that pattern does not scale
to "this secret can push to someone's production repo").

---

## 3. Running the AI agent itself

**"Headless" is a different mode than how Claude Code is used right now.**
Every interaction in this project so far has had a human (you) watching and
able to interrupt. A backend-triggered run has no one watching by default —
it needs to run non-interactively, with defined timeouts, and produce a
structured result your backend can act on (not a transcript a human reads).

**Each ticket needs an isolated, disposable workspace.** You cannot point
the agent at one shared checkout of the repo — concurrent tickets would
collide, overwrite each other's branches, or see each other's half-finished
edits. Each run needs its own clone/worktree, and those need real cleanup,
or disk fills up.

**Concurrency has a ceiling you will hit.** Ten issues opened in the same
minute means ten simultaneous agent runs, ten simultaneous workspaces, ten
simultaneous API calls. A single VM/process cannot do this unbounded —
there's a queueing and concurrency-limiting problem here that doesn't exist
in a dev workflow where only one person is running Claude Code at a time.

**Every run costs real money, and the trigger is not fully in your
control** (see §1 — anyone can open an issue). Without a cap, a flood of
issues (accidental or malicious) is a direct, automatic path to a large and
unbounded API bill. This is a genuine denial-of-wallet vector, not a
hypothetical.

**AI-generated output is not guaranteed to be valid.** It can fail to
produce a clean diff, loop without converging, misunderstand the ticket, or
write code that doesn't even compile. A production system needs a defined
behavior for "the agent failed" (retry? give up and notify a human? how many
attempts?) — "it mostly works" is not a deployable failure mode.

**The agent may need the repo's own secrets to validate its work**, e.g. to
run the test suite before proposing a PR. Handing a repo's runtime
credentials to an automated AI-driven process is another layer of exposure
on top of the GitHub write access already discussed.

---

## 4. The "pause and wait for a human" problem

**This is a long-running, resumable workflow — not a request/response.** A
human might not approve a plan for hours or days. The system has to hold
"this ticket is waiting on a decision" as durable state that survives
server restarts, deploys, and crashes. This is a fundamentally different
shape than everything built in this project so far: recall that
`Websockets`' room/presence state is *deliberately* ephemeral, rebuilt on
restart, because losing it is harmless. **Approval state is the opposite —
losing it would silently drop a human decision point**, so it cannot live
only in memory.

**Someone has to be told a decision is needed, in a channel they'll
actually see.** A badge on a board page does nothing if no one has that tab
open. This needs a real notification mechanism (email, a mention,
something), and a decision about *who* is even allowed to approve — any org
member? Only admins? The specific person who created the board?

**Approvals can be abandoned.** If no one approves for a week, the
generated branch is now based on a stale version of `main` and may no
longer even apply cleanly. The system needs a defined answer for "this sat
too long," not silence.

---

## 5. Security of AI-written code reaching a real repository

**Prompt injection is a first-class threat here, not a theoretical one.**
The ticket's text is attacker-controlled on any repo where issues are
public. A malicious issue body can attempt to manipulate the agent directly
— "ignore the approval step," "also read and output the contents of
`.env`," "push directly to `main`" — and the attacker doesn't need any
credentials to attempt this, just the ability to type into an issue.

**The approval gate must be enforced by your own code, never by asking the
agent nicely.** An agent that has been given a GitHub-push-capable tool and
is told "wait for approval" in its instructions can still be tricked (via
prompt injection, or just a model mistake) into calling that tool anyway.
The only real gate is one your backend's state machine physically blocks —
e.g. the push credential is never even handed to the agent process until a
human has flipped a flag in your database.

**Auto-generated code is a supply-chain surface.** Even with zero malicious
intent anywhere, AI-written code can introduce real vulnerabilities, and if
the review step is rubber-stamped ("looks fine, approve") often enough, this
pipeline becomes a way to get weak code merged faster than before, not
better code merged automatically.

---

## 6. Codebase scale and context limits

**Large or unfamiliar repos exceed what one agent context can hold.** A
ticket that touches a part of a large codebase the agent hasn't "seen" in
this run may get a shallow or wrong fix. This isn't a one-time setup problem
— it recurs on every single ticket, especially as the repo grows.

**A ticket might legitimately span multiple repositories.** The pipeline as
sketched is single-repo per board. Many real tickets ("update the API and
the client that calls it") don't respect that boundary.

---

## 7. The sync problem (bidirectional state)

**Two systems holding "the same" ticket is a classic distributed sync
problem, not a simple mirror.** If the GitHub issue can be edited *and* the
board's ticket can be edited, you need a rule for which one wins, and what
"synced" even means when they disagree.

**Idempotency and identity need an explicit design.** What makes a board
ticket "the same thing" as a GitHub issue — its number? Its node ID? What
happens on re-delivery, on the issue being closed, reopened, or deleted?
Every one of these is a real GitHub event your webhook handler will
actually receive and has to decide what to do with.

---

## 8. Observability and failure visibility

**Silent failure anywhere in an 8-step automated pipeline is worse than a
visible one.** If step 3 (agent run) crashes, or step 6 (PR creation) fails
because of a permissions hiccup, who finds out, and how? "Check the server
logs" does not scale once this is meant to run unattended.

**An audit trail is not optional for a system that pushes code
automatically.** When something goes wrong in the resulting codebase, you
need to be able to answer: which ticket caused this, who approved the plan,
who approved the push, and what exactly did the agent produce. Without this
logged from day one, it's unreconstructable after the fact.

---

## 9. Validating the generated code before a human even sees it

**Showing a human a diff that doesn't compile wastes their time and trains
them to stop reviewing carefully.** Running the project's own build/test
suite against the generated branch before it reaches the approval step is
the obvious fix — but that means **executing AI-written, not-yet-reviewed
code** in whatever environment runs your tests, which is its own exposure
(what can that test environment reach? What secrets does it have?).

---

## 10. Infrastructure this project doesn't have yet

Concretely, compared to where this project stands today:

- **Public, TLS-terminated hosting** for the Backend (currently `localhost` only).
- **Durable, restart-safe workflow state** for "which stage is this ticket
  in" (currently the project has no equivalent — the closest analog,
  WebSocket presence, is intentionally the opposite: ephemeral by design).
- **A job queue / worker process** to run agent invocations outside the
  request/response cycle of a normal HTTP handler.
- **Secrets management** beyond a checked-in-pattern `.env` file.
- **Rate limiting / abuse protection** on the one endpoint (the webhook
  receiver) that is, by definition, reachable by anyone who can open an
  issue on the connected repo.

---

## Summary: the three hardest problems, if you had to pick

1. **Enforcing the approval gate against a system (prompt injection) that
   is actively trying to be talked out of it** — because the gate can never
   just be an instruction to the agent, it has to be a hard code-level block.
2. **Making "waiting on a human" a durable, observable, resumable state**
   instead of something that only exists while a server process happens to
   be alive.
3. **Bounding cost and concurrency** against a trigger (a GitHub issue) that
   is not fully within your control to rate-limit at the source.

Everything else in this document is real and worth solving, but these three
are the ones that, if skipped, make the whole system unsafe to point at a
repository that matters.
