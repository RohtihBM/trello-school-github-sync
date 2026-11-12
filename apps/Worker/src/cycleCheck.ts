// Duplicated from apps/Backend/src/lib/cycleCheck.ts, not shared as a
// package — same reasoning as notifyBoard being duplicated across apps:
// this is a small, self-contained, pure function, not worth a shared
// package for one function used by exactly two processes.
export interface DependencyEdge {
  blockedId: string;
  blockerId: string;
}

// A TicketDependency row { blockedId: A, blockerId: B } means "A depends on
// B" — a directed edge A -> B. Proposing a NEW edge blockedId -> blockerId
// creates a cycle only if blockerId can already reach blockedId by walking
// forward through the existing graph (that would close A -> B -> ... -> A).
// Also correctly catches the trivial self-loop case (blockedId === blockerId)
// without any special-casing — the very first stack entry matches immediately.
export function wouldCreateCycle(
  edges: DependencyEdge[],
  blockedId: string,
  blockerId: string,
): boolean {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.blockedId) ?? [];
    list.push(edge.blockerId);
    adjacency.set(edge.blockedId, list);
  }

  const visited = new Set<string>();
  const stack = [blockerId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === blockedId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    stack.push(...(adjacency.get(current) ?? []));
  }

  return false;
}
