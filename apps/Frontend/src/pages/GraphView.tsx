import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Panel,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { ChevronRight, KanbanSquare, Network, Share2 } from "lucide-react";
import { api, type TicketStatus } from "../lib/api";
import { STATUS_LABEL } from "../components/ui/badge";
import { EmptyState } from "../components/ui/empty-state";
import { Skeleton } from "../components/ui/skeleton";
import { NavTabs } from "../components/NavTabs";
import { StatusIcon } from "../components/ui/status";
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

const NODE_WIDTH = 232;
const NODE_HEIGHT = 66;

// Nodes are paper tickets: the state glyph leads and a border tint carries
// urgency (blocked, ready) so the graph reads at a glance without eight
// competing fills.
const STATUS_BORDER: Record<TicketStatus, string> = {
  OPEN: "var(--color-border-strong)",
  PLANNING: "var(--color-accent-300)",
  BLOCKED: "var(--color-danger-500)",
  READY: "var(--color-success-500)",
  DONE: "var(--color-border-strong)",
};

const ALL_STATUSES: TicketStatus[] = ["OPEN", "PLANNING", "BLOCKED", "READY", "DONE"];

// A type alias, not an interface: React Flow requires node data to be assignable to
// Record<string, unknown>, which an interface is not.
type GraphNodeData = {
  title: string;
  description: string | null;
  status: TicketStatus;
  dimmed: boolean;
};

// A custom node (not React Flow's default box) for exactly one reason:
// the hover detail. The default node renders a plain div with no good
// seam to attach our own Tooltip component to — building our own node
// means the hover card matches the rest of the app's Tooltip styling
// instead of a native browser title="" tooltip, which would look like a
// different, cheaper product bolted on.
function GraphNode({ data }: NodeProps<Node<GraphNodeData>>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          style={{ borderColor: STATUS_BORDER[data.status], width: NODE_WIDTH, opacity: data.dimmed ? 0.3 : 1 }}
          className="cursor-pointer rounded-xl border bg-surface px-3.5 py-3 font-sans text-foreground shadow-raise transition-[opacity,box-shadow,translate] duration-300 ease-out-expo hover:-translate-y-0.5 hover:shadow-lift"
        >
          <Handle type="target" position={Position.Left} className="bg-neutral-400!" />
          <div className="flex items-start gap-2.5">
            <StatusIcon status={data.status} className="mt-px" />
            <p className="truncate text-compact font-medium leading-5">{data.title}</p>
          </div>
          <p className="mt-1.5 pl-[1.625rem] font-mono text-xs uppercase tracking-[0.06em] text-neutral-500">{STATUS_LABEL[data.status]}</p>
          <Handle type="source" position={Position.Right} className="bg-neutral-400!" />
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        <p className="font-medium">{data.title}</p>
        <p className="mt-0.5 text-neutral-400">{data.description ?? "No description"}</p>
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
      <header className="relative z-10 shrink-0 border-b border-border bg-glow">
        <div className="px-4 pt-5 sm:px-8">
          <nav aria-label="Breadcrumb" className="type-eyebrow flex items-center gap-1.5">
            <Link to="/" className="rounded-sm transition-colors hover:text-foreground pointer-coarse:-my-3 pointer-coarse:py-3">
              Boards
            </Link>
            <ChevronRight aria-hidden className="h-3 w-3 text-neutral-400" />
            <Link to={`/boards/${boardId}`} className="rounded-sm transition-colors hover:text-foreground pointer-coarse:-my-3 pointer-coarse:py-3">
              Board
            </Link>
            <ChevronRight aria-hidden className="h-3 w-3 text-neutral-400" />
            <span aria-current="page" className="text-neutral-600">
              Dependencies
            </span>
          </nav>
          <div className="mt-3 space-y-1.5">
            <h1 className="type-title">Dependency graph</h1>
            <p className="text-compact text-neutral-500">Hover a ticket to trace what blocks it and what it unblocks. Click to open it.</p>
          </div>
          <div className="mt-5">
            <NavTabs
              label="Board views"
              items={[
                { label: "Board", to: `/boards/${boardId}`, active: false, icon: <KanbanSquare className="h-4 w-4" /> },
                { label: "Dependency graph", to: `/boards/${boardId}/graph`, active: true, icon: <Network className="h-4 w-4" /> },
              ]}
            />
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 bg-sunken">
        {loading && (
          <div className="flex h-full items-center justify-center gap-6 p-8" aria-busy="true" aria-label="Loading graph">
            <Skeleton className="h-16 w-56" />
            <Skeleton className="h-16 w-56" />
            <Skeleton className="h-16 w-56" />
          </div>
        )}

        {!loading && !loadError && nodes.length === 0 && (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState
              icon={Share2}
              title="No tickets to graph yet"
              description="Once this board has tickets, the dependencies between them are drawn here."
            />
          </div>
        )}

        {!loading && nodes.length > 0 && (
          <div className="h-full">
            <ReactFlow
              nodes={displayNodes}
              edges={displayEdges}
              nodeTypes={NODE_TYPES}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              proOptions={{ hideAttribution: false }}
              onNodeClick={(_event, node) => navigate(`/boards/${boardId}?issue=${node.id}`)}
              onNodeMouseEnter={(_event, node) => setHoveredId(node.id)}
              onNodeMouseLeave={() => setHoveredId(null)}
            >
              <Background color={resolvedColors.neutral300} gap={22} size={1.3} />
              <Controls showInteractive={false} />
              <Panel position="top-left" className="m-4!">
                <div aria-label="Graph legend" className="space-y-3 rounded-xl bg-surface/90 p-4 text-xs shadow-raise ring-1 ring-border backdrop-blur">
                  <p className="type-eyebrow">Status</p>
                  <ul className="grid grid-cols-2 gap-x-5 gap-y-1.5">
                    {ALL_STATUSES.map((st) => (
                      <li key={st} className="flex items-center gap-2 text-neutral-600">
                        <StatusIcon status={st} className="h-3.5 w-3.5" />
                        {STATUS_LABEL[st]}
                      </li>
                    ))}
                  </ul>
                  {/* Hover tracing only exists with a mouse, so the edge key
                      is hidden on touch screens. */}
                  <p className="type-eyebrow hidden pt-1 pointer-fine:block">On hover</p>
                  <ul className="hidden space-y-1.5 pointer-fine:block">
                    <li className="flex items-center gap-2 text-neutral-600">
                      <span aria-hidden className="h-0.5 w-5 rounded bg-danger-600" /> Blocks
                    </li>
                    <li className="flex items-center gap-2 text-neutral-600">
                      <span aria-hidden className="h-0.5 w-5 rounded bg-accent-600" /> Blocked by
                    </li>
                  </ul>
                </div>
              </Panel>
              <MiniMap className="hidden sm:block" style={{ width: 150, height: 96 }} maskColor="rgba(0, 0, 0, 0.05)" nodeColor={resolvedColors.neutral300} pannable />
            </ReactFlow>
          </div>
        )}
      </main>
    </div>
  );
}
