import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { FolderKanban, MoreHorizontal, Plus, Search } from "lucide-react";
import { api, type Board, type Org } from "../lib/api";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Avatar, AvatarFallback, initialFromEmail } from "../components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { toast } from "../hooks/use-toast";

// Deterministic from the title, not random on every render — the same
// board shows the same color every time it's seen, the same reasoning
// already used for Avatar's initialFromEmail.
const TILE_COLORS = [
  "bg-accent-100 text-accent-700",
  "bg-success-100 text-success-700",
  "bg-warning-100 text-warning-700",
  "bg-danger-100 text-danger-700",
];
function tileColorFor(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) | 0;
  return TILE_COLORS[Math.abs(hash) % TILE_COLORS.length];
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? "s" : ""} ago`;
}

export function BoardsList() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [boardRepository, setBoardRepository] = useState("");
  const [orgName, setOrgName] = useState("");
  const [boardTitle, setBoardTitle] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [creatingBoard, setCreatingBoard] = useState(false);

  const [renameTarget, setRenameTarget] = useState<Board | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameDescription, setRenameDescription] = useState("");
  const [renaming, setRenaming] = useState(false);

  async function loadAll() {
    const [boardsData, orgsData] = await Promise.all([
      api<Board[]>("/boards"),
      api<Org[]>("/organisations"),
    ]);
    setBoards(boardsData);
    setOrgs(orgsData);
    setSelectedOrgId((prev) => prev || orgsData[0]?.id || "");
  }

  useEffect(() => {
    loadAll()
      .catch((err) =>
        toast({
          title: "Failed to load boards",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        }),
      )
      .finally(() => setLoading(false));
  }, []);

  const filteredBoards = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return boards;
    return boards.filter(
      (b) => b.title.toLowerCase().includes(q) || b.description?.toLowerCase().includes(q),
    );
  }, [boards, search]);

  async function handleCreateOrg(e: FormEvent) {
    e.preventDefault();
    if (orgName.trim() === "" || creatingOrg) return;
    setCreatingOrg(true);
    try {
      const org = await api<Org>("/organisations", {
        method: "POST",
        body: JSON.stringify({ name: orgName }),
      });
      setOrgs((prev) => [...prev, org]);
      setSelectedOrgId(org.id);
      setOrgName("");
    } catch (err) {
      toast({
        title: "Failed to create organisation",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setCreatingOrg(false);
    }
  }

  async function handleCreateBoard(e: FormEvent) {
    e.preventDefault();
    if (boardTitle.trim() === "" || !selectedOrgId || creatingBoard) return;
    setCreatingBoard(true);
    try {
      await api("/boards", {
        method: "POST",
        body: JSON.stringify({ title: boardTitle, orgId: selectedOrgId, repository: boardRepository.trim() }),
      });
      setBoardTitle("");
      setBoardRepository("");
      setCreateOpen(false);
      await loadAll();
    } catch (err) {
      toast({
        title: "Failed to create board",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setCreatingBoard(false);
    }
  }

  function openRename(board: Board) {
    setRenameTarget(board);
    setRenameTitle(board.title);
    setRenameDescription(board.description ?? "");
  }

  async function handleRename(e: FormEvent) {
    e.preventDefault();
    if (!renameTarget || renameTitle.trim() === "" || renaming) return;
    setRenaming(true);
    try {
      await api(`/boards/${renameTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: renameTitle, description: renameDescription }),
      });
      setRenameTarget(null);
      await loadAll();
    } catch (err) {
      toast({
        title: "Failed to update board",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setRenaming(false);
    }
  }

  const hasOrgs = orgs.length > 0;
  const currentOrg = orgs.find((o) => o.id === selectedOrgId) ?? orgs[0];

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* Stacked below sm — title row, then search+action row — rather
          than three items fighting for one 375px-wide row. The subtitle
          drops entirely on mobile: it's explanatory, not essential, and
          "Your organisation's development boards" alone would wrap
          across most of the remaining width at that size. */}
      <header className="border-b border-border bg-surface px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Boards</h1>
            <p className="hidden text-sm text-muted-foreground sm:block">
              Your organisation's development boards
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search boards..."
                className="h-8 w-full pl-8 text-xs sm:w-48"
              />
            </div>
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> New Board
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 p-6">
        {/* Organisation section — a static label today since this app's
            real data has only ever had one org; built to actually switch
            if a second one ever exists, not a fake selector. */}
        {currentOrg && (
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">{currentOrg.name}</p>
              <p className="text-xs text-muted-foreground">
                {boards.length} board{boards.length === 1 ? "" : "s"}
              </p>
            </div>
            {orgs.length > 1 && (
              <Select
                aria-label="Switch organisation"
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="w-48"
              >
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : boards.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-muted-foreground">
              <FolderKanban className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No boards yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first board to start planning tickets.
              </p>
            </div>
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Create a board
            </Button>
          </Card>
        ) : filteredBoards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No boards match "{search}".</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {filteredBoards.map((board) => (
              <Card key={board.id} className="relative flex h-full flex-col gap-2 p-4 transition-colors hover:border-accent-300">
                <Link to={`/boards/${board.id}`} className="flex flex-1 flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-md text-sm font-semibold ${tileColorFor(board.title)}`}
                    >
                      {board.title.charAt(0).toUpperCase()}
                    </div>
                  </div>
                  <p className="text-sm font-medium text-foreground">{board.title}</p>
                  {board.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{board.description}</p>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-2 text-xs text-muted-foreground">
                    <span>{board.issueCount} issue{board.issueCount === 1 ? "" : "s"}</span>
                    <span>Updated {formatRelative(board.updatedAt)}</span>
                  </div>
                  {board.members.length > 0 && (
                    <div className="flex -space-x-2">
                      {board.members.slice(0, 4).map((m) => (
                        <Avatar key={m.email} className="h-5 w-5 border-2 border-surface text-[0.6rem]">
                          <AvatarFallback>{initialFromEmail(m.email)}</AvatarFallback>
                        </Avatar>
                      ))}
                      {board.members.length > 4 && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-surface bg-neutral-100 text-[0.6rem] text-muted-foreground">
                          +{board.members.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </Link>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                      aria-label={`Options for ${board.title}`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem onSelect={() => openRename(board)}>Rename</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogTitle>Create a board</DialogTitle>
          {!hasOrgs ? (
            <>
              <DialogDescription>
                You need an organisation first — boards live inside one.
              </DialogDescription>
              <form onSubmit={handleCreateOrg} className="mt-4 space-y-3">
                <Input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Organisation name"
                  disabled={creatingOrg}
                  autoFocus
                />
                <Button type="submit" variant="primary" disabled={creatingOrg} className="w-full">
                  {creatingOrg ? "Creating..." : "Create organisation"}
                </Button>
              </form>
            </>
          ) : (
            <>
              <DialogDescription>Pick an organisation and name the board.</DialogDescription>
              <form onSubmit={handleCreateBoard} className="mt-4 space-y-3">
                <Select
                  aria-label="Organisation"
                  value={selectedOrgId}
                  onChange={(e) => setSelectedOrgId(e.target.value)}
                >
                  {orgs.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </Select>
                <Input
                  value={boardTitle}
                  onChange={(e) => setBoardTitle(e.target.value)}
                  placeholder="Board title"
                  disabled={creatingBoard}
                  autoFocus
                />
                <Input
                  value={boardRepository}
                  onChange={(e) => setBoardRepository(e.target.value)}
                  placeholder="GitHub repository, e.g. owner/name (optional)"
                  disabled={creatingBoard}
                />
                <Button type="submit" variant="primary" disabled={creatingBoard} className="w-full">
                  {creatingBoard ? "Creating..." : "Create board"}
                </Button>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogTitle>Edit board</DialogTitle>
          <form onSubmit={handleRename} className="mt-4 space-y-3">
            <Input
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              placeholder="Board title"
              disabled={renaming}
              autoFocus
            />
            <Input
              value={renameDescription}
              onChange={(e) => setRenameDescription(e.target.value)}
              placeholder="Description (optional)"
              disabled={renaming}
            />
            <Button type="submit" variant="primary" disabled={renaming} className="w-full">
              {renaming ? "Saving..." : "Save"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
