// Vite only exposes env vars prefixed VITE_, and only ones actually set at
// BUILD time (not runtime) — the deployed Render Backend URL has to be
// known when Vercel builds this, via its own VITE_API_URL env var. Falls
// back to localhost so local dev (no env var set) keeps working exactly
// as before.
const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export function getToken(): string | null {
  return localStorage.getItem("token");
}

export function setToken(token: string) {
  localStorage.setItem("token", token);
}

export function clearToken() {
  localStorage.removeItem("token");
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

export interface Board {
  id: string;
  title: string;
  description: string | null;
  orgId: string;
  createdAt: string;
  updatedAt: string;
  // Both added for the dashboard redesign — real, from an extended
  // GET /boards query, never faked client-side.
  issueCount: number;
  members: { email: string }[];
}

export interface Org {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanMessage {
  id: string;
  issueId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export type TicketStatus = "OPEN" | "PLANNING" | "BLOCKED" | "READY" | "DONE";

export interface TicketDependency {
  id: string;
  blockedId: string;
  blockerId: string;
  assumedContract: string | null;
  actualContract: string | null;
  mismatchFlag: boolean;
  // status is needed to tell "still blocked" apart from "blocker is DONE
  // but never had a plan to diff against" — the fourth badge state that
  // closes the "waiting forever" gap logged during phase 3's click-through.
  blocker: { id: string; title: string; status: TicketStatus };
}

export interface SuggestedDependency {
  blockerId: string;
  assumedContract: string;
}

export interface Assignee {
  user: { id: string; email: string };
}

export interface BoardMember {
  id: string;
  email: string;
}

export interface Issue {
  id: string;
  title: string;
  description: string | null;
  position: number;
  boardId: string;
  sectionId: string;
  status: TicketStatus;
  plan: string | null;
  // A revision to `plan` that chat discussion produced — set only while
  // waiting on a human to accept or reject it; never applied on its own.
  proposedPlan: string | null;
  planMessages: PlanMessage[];
  dependsOn: TicketDependency[];
  // Claude's own suggestion from plan generation — never auto-committed;
  // a real dependency only exists once a human confirms it through the
  // same form/route a manually-declared one uses.
  suggestedDependency: SuggestedDependency | null;
  assignees: Assignee[];
}

// Not persisted anywhere — computed fresh by the Worker each time a plan
// is generated, carried only on the plan-ready broadcast.
export interface OverlapInfo {
  id: string;
  title: string;
  sharedFiles: string[];
}

export interface Section {
  id: string;
  title: string;
  position: number;
  boardId: string;
  issues: Issue[];
}

export interface ConnectedUser {
  userId: string;
  email: string;
}
