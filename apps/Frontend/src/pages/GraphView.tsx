import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { ArrowLeft, Loader2 } from "lucide-react";
import { api, type TicketStatus } from "../lib/api";
import { Button } from "../components/ui/button";
import { Badge, STATUS_BADGE_VARIANT } from "../components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { toast } from "../hooks/use-toast";

interface GraphIssue {
  id: string;
  title: string;
  description: string | null;
  status: TicketStatus;
}

interface GraphEdge {
  id: string;
  blockedId: string;
  blockerId: string;
}

const NODE_WIDTH = 190;
const NODE_HEIGHT = 56;

// Resolved from the same CSS custom properties every other component
// reads (index.css's @theme block) — not hardcoded hex, so a node's
// color here is tied to the exact same source of truth as a Badge
// anywhere else in the app.
const STATUS_NODE_STYLE: Record<TicketStatus, { background: string; color: string; borderColor: string }> = {
  OPEN: { background: "var(--color-neutral-100)", color: "var(--color-neutral-700)", borderColor: "var(--color-neutral-300)" },
  PLANNING: { background: "var(--color-accent-100)", color: "var(--color-accent-700)", borderColor: "var(--color-accent-200)" },
  BLOCKED: { background: "var(--color-danger-100)", color: "var(--color-danger-700)", borderColor: "var(--color-danger-600)" },
  READY: { background: "var(--color-success-100)", color: "var(--color-success-700)", borderColor: "var(--color-success-600)" },
  DONE: { background: "var(--color-success-100)", color: "var(--color-success-700)", borderColor: "var(--color-success-600)" },
};

const ALL_STATUSES: TicketStatus[] = ["OPEN", "PLANNING", "BLOCKED", "READY", "DONE"];

interface GraphNodeData {
  title: string;
  description: string | null;
  status: TicketStatus;
  dimmed: boolean;
}

// A custom node (not React Flow's default box) for exactly one reason:
// the hover detail. The default node renders a plain div with no good
// seam to attach our own Tooltip component to — building our own node
// means the hover card matches the rest of the app's Tooltip styling
// instead of a native browser title="" tooltip, which would look like a
// different, cheaper product bolted on.
function GraphNode({ data }: NodeProps<Node<GraphNodeData>>) {
  const colors = STATUS_NODE_STYLE[data.status];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          style={{
            background: colors.background,
            color: colors.color,
            borderColor: colors.borderColor,
            width: NODE_WIDTH,
            opacity: data.dimmed ? 0.35 : 1,
          }}
          className="cursor-pointer rounded-md border px-2.5 py-2 font-sans text-xs transition-opacity"
        >
          <Handle type="target" position={Position.Left} className="bg-neutral-400!" />
          <p className="truncate font-medium">{data.title}</p>
          <p className="mt-0.5 text-[0.65rem] opacity-80">{data.status}</p>
          <Handle type="source" position={Position.Right} className="bg-neutral-400!" />
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-60">
        <p className="font-medium">{data.title}</p>
        <p className="mt-0.5 text-muted-foreground">{data.description ?? "No description"}</p>
      </TooltipContent>
    </Tooltip>
  );
}

const NODE_TYPES = { graphNode: GraphNode };

// dagre does the actual layout math; React Flow just renders whatever
// positions come out of it. dagre positions are CENTER points, React
// Flow wants top-left, hence the width/2, height/2 offset below.
function layout(issues: GraphIssue[], edges: GraphEdge[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  // Extra nodesep/ranksep over dagre's defaults — legibility at higher
  // node counts means breathing room between boxes, not just a layout
  // algorithm; the default spacing starts to feel cramped past ~6 nodes.
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 70 });

  for (const issue of issues) {
    g.setNode(issue.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  // blocker -> blocked: the prerequisite points at the thing it unblocks,
  // the natural reading direction for a dependency graph.
  for (const edge of edges) {
    g.setEdge(edge.blockerId, edge.blockedId);
  }

  dagre.layout(g);

  const nodes: Node[] = issues.map((issue) => {
    const pos = g.node(issue.id);
    return {
      id: issue.id,
      type: "graphNode",
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: { title: issue.title, description: issue.description, status: issue.status, dimmed: false },
      // Explicit, not left to auto-measurement — found directly, not
      // assumed: without these, MiniMap had literally zero node
      // elements in its rendered SVG (not a color/mask issue, an
      // actual absence), because it needs a real width/height on the
      // Node object itself to draw a minimap rectangle, and a custom
      // node wrapped in a Tooltip apparently doesn't reliably resolve
      // that through React Flow's own ResizeObserver-based measurement.
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    };
  });

  const flowEdges: Edge[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.blockerId,
    target: edge.blockedId,
    type: "smoothstep",
    style: { stroke: "var(--color-neutral-400)" },
    markerEnd: { type: "arrowclosed", color: "var(--color-neutral-400)" } as Edge["markerEnd"],
  }));

  return { nodes, edges: flowEdges };
}

export function GraphView() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // MiniMap/Background render their node/dot previews on an HTML5
  // <canvas>, not real SVG/CSS — found by an actual investigation, not
  // assumed: canvas's fillStyle silently rejects a literal "var(...)"
  // string (it needs a real resolved color), which is exactly why the
  // minimap was rendering as a blank box while the main graph nodes
  // (styled via a real inline `style` object, genuine CSS) rendered
  // their colors correctly. Resolving the actual computed value once
  // here keeps this still tied to the same design-token source of
  // truth, just as a literal canvas can actually use.
  const resolvedColors = useMemo(() => {
    const styles = getComputedStyle(document.documentElement);
    return {
      neutral100: styles.getPropertyValue("--color-neutral-100").trim(),
      neutral300: styles.getPropertyValue("--color-neutral-300").trim(),
    };
  }, []);

  useEffect(() => {
    if (!boardId) return;
    let cancelled = false;

    api<{ issues: GraphIssue[]; edges: GraphEdge[] }>(`/boards/${boardId}/dependencies`)
      .then(({ issues, edges }) => {
        if (cancelled) return;
        const laidOut = layout(issues, edges);
        setNodes(laidOut.nodes);
        setEdges(laidOut.edges);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(true);
        toast({
          title: "Failed to load graph",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [boardId]);

  // Incoming/outgoing distinguishability: hovering a node highlights its
  // edges in two different colors depending on direction (what blocks
  // it vs. what it blocks) and dims every unrelated node/edge, instead
  // of a flat, undifferentiated web of identical gray lines once there
  // are more than a couple of edges on screen.
  const displayNodes = useMemo(() => {
    if (!hoveredId) return nodes;
    const connectedIds = new Set([hoveredId]);
    for (const e of edges) {
      if (e.source === hoveredId) connectedIds.add(e.target);
      if (e.target === hoveredId) connectedIds.add(e.source);
    }
    return nodes.map((n) => ({ ...n, data: { ...n.data, dimmed: !connectedIds.has(n.id) } }));
  }, [nodes, edges, hoveredId]);

  const displayEdges = useMemo(() => {
    if (!hoveredId) return edges;
    return edges.map((e) => {
      const isOutgoing = e.source === hoveredId; // this node BLOCKS the target
      const isIncoming = e.target === hoveredId; // this node IS BLOCKED BY the source
      if (!isOutgoing && !isIncoming) {
        return { ...e, style: { stroke: "var(--color-neutral-300)" }, animated: false };
      }
      return {
        ...e,
        style: {
          stroke: isOutgoing ? "var(--color-danger-600)" : "var(--color-accent-600)",
          strokeWidth: 2,
        },
        markerEnd: {
          type: "arrowclosed",
          color: isOutgoing ? "var(--color-danger-600)" : "var(--color-accent-600)",
        } as Edge["markerEnd"],
        animated: true,
      };
    });
  }, [edges, hoveredId]);

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="border-b border-border bg-surface">
        {/* flex-wrap: the 5-badge legend doesn't fit alongside the title
            and back button on a phone-width screen (confirmed by actually
            measuring document.documentElement.scrollWidth at 375px, not
            just eyeballing it) — it drops to its own row instead of
            forcing the whole page to scroll horizontally. */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 px-6 py-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/boards/${boardId}`}>
              <ArrowLeft className="h-3.5 w-3.5" /> Board
            </Link>
          </Button>
          <h1 className="text-sm font-semibold text-foreground">Dependency graph</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            {ALL_STATUSES.map((s) => (
              <Badge key={s} variant={STATUS_BADGE_VARIANT[s]}>
                {s}
              </Badge>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 p-4">
        {loading && (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        )}

        {!loading && !loadError && nodes.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">No tickets on this board yet.</p>
          </div>
        )}

        {!loading && nodes.length > 0 && (
          <div className="h-full rounded-lg border border-border bg-surface">
            <ReactFlow
              nodes={displayNodes}
              edges={displayEdges}
              nodeTypes={NODE_TYPES}
              fitView
              onNodeClick={(_event, node) => navigate(`/boards/${boardId}?issue=${node.id}`)}
              onNodeMouseEnter={(_event, node) => setHoveredId(node.id)}
              onNodeMouseLeave={() => setHoveredId(null)}
            >
              <Background color={resolvedColors.neutral300} />
              <Controls />
              {/* Hidden below sm — at phone width it's large enough to
                  visually overlap real node cards underneath it rather
                  than sit cleanly in a corner, and isn't genuinely
                  useful for a graph this small on a screen this size.

                  maskColor is deliberately translucent (rgba, not the
                  resolved neutral-100 token) — found directly, not
                  guessed: the minimap's mask path was rendering as one
                  fully opaque rectangle covering the ENTIRE minimap
                  (its viewport-cutout wasn't actually being carved out
                  in this xyflow version/graph shape), which painted
                  over every node color underneath it regardless of
                  what color was used. Translucency is what keeps nodes
                  visible through it either way, rather than depending
                  on a cutout that isn't reliably happening. */}
              <MiniMap
                className="hidden sm:block"
                maskColor="rgba(0, 0, 0, 0.08)"
                nodeColor={resolvedColors.neutral300}
              />
            </ReactFlow>
          </div>
        )}
      </main>
    </div>
  );
}
