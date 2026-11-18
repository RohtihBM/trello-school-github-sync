import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ArrowUpRight, FolderKanban, GitBranch, MoreHorizontal, Plus, Search, SearchX } from "lucide-react";
import { api, type Board, type Org } from "../lib/api";
import { EASE_OUT, riseIn, staggerParent } from "../lib/motion";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Field } from "../components/ui/field";
import { Skeleton } from "../components/ui/skeleton";
import { EmptyState } from "../components/ui/empty-state";
import { Segmented } from "../components/ui/segmented";
import { Avatar, AvatarFallback, initialFromEmail } from "../components/ui/avatar";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { toast } from "../hooks/use-toast";

type SortKey = "recent" | "name" | "tickets";

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
  const [sort, setSort] = useState<SortKey>("recent");

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
  const navigate = useNavigate();

  const query = search.trim();
  // The board you were last in is promoted to a feature panel (unless you're
  // searching, when you want a flat result list); everything else is a
  // sortable ledger below it.
  const featured = useMemo(() => {
    if (query || boards.length === 0) return null;
    return [...boards].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))[0];
  }, [boards, query]);

  const tableRows = useMemo(() => {
    const rows = filteredBoards.filter((b) => b.id !== featured?.id);
    const sorters: Record<SortKey, (a: Board, b: Board) => number> = {
      recent: (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt),
      name: (a, b) => a.title.localeCompare(b.title),
      tickets: (a, b) => b.issueCount - a.issueCount,
    };
    return rows.sort(sorters[sort]);
  }, [filteredBoards, featured, sort]);

  function boardMenu(board: Board, onDark = false) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => e.stopPropagation()}
            className={onDark ? "text-white/60 hover:bg-white/10 hover:text-white data-[state=open]:bg-white/10" : "text-neutral-400 data-[state=open]:bg-neutral-900/[0.07]"}
            aria-label={`Options for ${board.title}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => openRename(board)}>Edit board</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="bg-glow">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-8 pt-10 sm:px-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="type-eyebrow">{currentOrg ? currentOrg.name : "Workspace"}</p>
            <h1 className="type-display mt-3">
              Boards
              {!loading && (
                <span className="ml-3 align-top font-display text-[0.5em] italic leading-none text-neutral-400">
                  <AnimatedNumber value={boards.length} />
                </span>
              )}
            </h1>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="relative flex-1 md:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                type="search"
                aria-label="Search boards"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search boards"
                className="w-full pl-9 md:w-64"
              />
            </div>
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New board
            </Button>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-10 px-4 pb-16 sm:px-8">
        {orgs.length > 1 && (
          <div className="flex items-center gap-3">
            <label htmlFor="default-org" className="text-compact text-neutral-500">
              New boards go to
            </label>
            <Select id="default-org" value={selectedOrgId} onChange={(e) => setSelectedOrgId(e.target.value)} className="h-9 w-52 text-compact">
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        {loading ? (
          <div className="space-y-8" aria-busy="true" aria-label="Loading boards">
            <Skeleton className="h-64 w-full rounded-3xl" />
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </div>
        ) : boards.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="Start with a board"
            description="A board turns a GitHub repository's issues into tickets Claude can plan."
            action={
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Create a board
              </Button>
            }
          />
        ) : (
          <motion.div variants={staggerParent(0.08)} initial="hidden" animate="show" className="space-y-12">
            {featured && (
              <motion.section variants={riseIn} aria-label="Most recently updated board">
                <div
                  onClick={() => navigate(`/boards/${featured.id}`)}
                  className="group relative cursor-pointer overflow-hidden rounded-3xl bg-neutral-950 p-7 text-white shadow-[0_30px_60px_-30px_oklch(21%_0.03_165/0.7)] ring-1 ring-white/5 sm:p-10"
                >
                  <div aria-hidden className="absolute inset-0 bg-[radial-gradient(40rem_24rem_at_100%_0%,oklch(56%_0.15_41/0.4),transparent_62%),radial-gradient(34rem_22rem_at_0%_110%,oklch(50%_0.115_152/0.3),transparent_60%)] transition-opacity duration-700 group-hover:opacity-80" />
                  <div aria-hidden className="bg-grain absolute inset-0 opacity-[0.06]" />
                  {/* Faint lane lines — the board, drawn as architecture. */}
                  <div aria-hidden className="absolute inset-y-0 right-0 hidden w-[46%] grid-cols-3 border-l border-white/[0.06] md:grid">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="border-r border-white/[0.06] last:border-r-0" />
                    ))}
                  </div>

                  <div className="absolute right-4 top-4 z-10">{boardMenu(featured, true)}</div>

                  <div className="relative grid gap-10 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                    <div className="space-y-6">
                      <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em] text-accent-300">
                        <span className="h-1.5 w-1.5 animate-pulse-ring rounded-full bg-accent-400" />
                        Pick up where you left off
                      </p>
                      <div className="space-y-3">
                        <h2 className="font-display text-[2.5rem] leading-[1.02] tracking-[-0.025em] sm:text-[3.25rem]">
                          <Link
                            to={`/boards/${featured.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded-sm outline-offset-4 after:absolute after:inset-0 after:content-[''] focus-visible:outline-white"
                          >
                            {featured.title}
                          </Link>
                        </h2>
                        {featured.description && (
                          <p className="line-clamp-2 max-w-lg text-[0.9375rem] leading-6 text-neutral-400">{featured.description}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-neutral-400">
                        {featured.repository && (
                          <span className="inline-flex items-center gap-1.5 font-mono text-compact text-neutral-300">
                            <GitBranch aria-hidden className="h-3.5 w-3.5" />
                            {featured.repository}
                          </span>
                        )}
                        <span>Updated {formatRelative(featured.updatedAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-end justify-between gap-6 md:flex-col md:items-start md:justify-between">
                      <div>
                        <div className="type-numeral text-[5.5rem] leading-[0.85] text-white sm:text-[7rem]">
                          <AnimatedNumber value={featured.issueCount} />
                        </div>
                        <p className="mt-3 font-mono text-xs uppercase tracking-[0.1em] text-neutral-400">
                          ticket{featured.issueCount === 1 ? "" : "s"}<span className="hidden sm:inline"> on the board</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        {featured.members.length > 0 && (
                          <div className="flex -space-x-2">
                            {featured.members.slice(0, 4).map((m) => (
                              <Avatar key={m.email} email={m.email} className="h-8 w-8 border-2 border-neutral-950">
                                <AvatarFallback>{initialFromEmail(m.email)}</AvatarFallback>
                              </Avatar>
                            ))}
                          </div>
                        )}
                        <span className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-white px-4 text-sm font-medium text-neutral-950 transition-transform duration-300 group-hover:translate-x-1">
                          Open <ArrowRight className="h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.section>
            )}

            <motion.section variants={riseIn} aria-label="All boards">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="type-subtitle">
                  {featured ? "Other boards" : query ? `Results for “${query}”` : "All boards"}
                </h2>
                {tableRows.length > 1 && (
                  <Segmented<SortKey>
                    label="Sort boards"
                    value={sort}
                    onChange={setSort}
                    options={[
                      { value: "recent", label: "Recent" },
                      { value: "name", label: "Name" },
                      { value: "tickets", label: "Tickets" },
                    ]}
                  />
                )}
              </div>

              {tableRows.length === 0 && query ? (
                <EmptyState
                  icon={SearchX}
                  title={`Nothing matches “${query}”`}
                  description="Check the spelling, or search by part of a title or description."
                  action={
                    <Button variant="secondary" size="sm" onClick={() => setSearch("")}>
                      Clear search
                    </Button>
                  }
                />
              ) : tableRows.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border-strong px-5 py-8 text-center text-sm text-neutral-500">
                  This is your only board. Create another and it will appear here.
                </p>
              ) : (
                <table className="w-full border-separate border-spacing-0 text-left">
                  <thead>
                    <tr className="[&>th]:border-b [&>th]:border-border-strong [&>th]:pb-3 [&>th]:pt-1">
                      <th className="type-eyebrow w-[38%] font-medium">Board</th>
                      <th className="type-eyebrow hidden font-medium lg:table-cell">Repository</th>
                      <th className="type-eyebrow w-24 text-right font-medium">Tickets</th>
                      <th className="type-eyebrow hidden pl-8 font-medium md:table-cell">People</th>
                      <th className="type-eyebrow hidden w-32 text-right font-medium sm:table-cell">Updated</th>
                      <th className="w-12" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence initial={false} mode="popLayout">
                      {tableRows.map((board, i) => (
                        <motion.tr
                          key={board.id}
                          layout="position"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT, delay: Math.min(i, 8) * 0.035 } }}
                          exit={{ opacity: 0, transition: { duration: 0.15 } }}
                          onClick={() => navigate(`/boards/${board.id}`)}
                          className="group relative cursor-pointer transition-colors duration-200 hover:bg-white/70 [&>td]:border-b [&>td]:border-border [&>td]:py-4"
                        >
                          <td className="pr-4">
                            <div className="flex min-w-0 items-center gap-3.5">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface font-display text-xl leading-none text-neutral-700 shadow-raise ring-1 ring-border transition-transform duration-300 group-hover:-rotate-3">
                                {board.title.charAt(0).toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <Link
                                  to={`/boards/${board.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="block truncate text-[0.9375rem] font-medium text-foreground pointer-coarse:-my-3 pointer-coarse:py-3"
                                >
                                  {board.title}
                                </Link>
                                {board.description && <p className="mt-0.5 line-clamp-1 text-compact text-neutral-500">{board.description}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="hidden pr-4 lg:table-cell">
                            {board.repository ? (
                              <span className="inline-flex items-center gap-1.5 font-mono text-xs text-neutral-600">
                                <GitBranch aria-hidden className="h-3 w-3 text-neutral-400" />
                                {board.repository}
                              </span>
                            ) : (
                              <span className="text-xs text-neutral-400">Not linked</span>
                            )}
                          </td>
                          <td className="text-right">
                            <span className="type-numeral text-[1.75rem] leading-none text-foreground">{board.issueCount}</span>
                          </td>
                          <td className="hidden pl-8 md:table-cell">
                            {board.members.length > 0 ? (
                              <div className="flex -space-x-1.5">
                                {board.members.slice(0, 4).map((m) => (
                                  <Avatar key={m.email} email={m.email} className="h-6 w-6 border-2 border-background">
                                    <AvatarFallback>{initialFromEmail(m.email)}</AvatarFallback>
                                  </Avatar>
                                ))}
                                {board.members.length > 4 && (
                                  <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-neutral-200 text-[0.625rem] font-medium text-neutral-600">
                                    +{board.members.length - 4}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-neutral-400">—</span>
                            )}
                          </td>
                          <td className="hidden text-right text-compact text-neutral-500 sm:table-cell">{formatRelative(board.updatedAt)}</td>
                          <td className="pl-2 text-right">
                            <span className="inline-flex items-center gap-0.5">
                              {boardMenu(board)}
                              <ArrowUpRight aria-hidden className="h-4 w-4 -translate-x-1 text-neutral-400 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                            </span>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              )}
            </motion.section>
          </motion.div>
        )}
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogTitle>Create a board</DialogTitle>
          {!hasOrgs ? (
            <>
              <DialogDescription>You need an organisation first — boards live inside one.</DialogDescription>
              <form onSubmit={handleCreateOrg} className="mt-5 space-y-5">
                <Field label="Organisation name" htmlFor="org-name">
                  <Input
                    id="org-name"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    disabled={creatingOrg}
                    autoFocus
                  />
                </Field>
                <div className="flex justify-end gap-2">
                  <DialogClose asChild>
                    <Button type="button" variant="secondary">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button type="submit" variant="primary" disabled={creatingOrg}>
                    {creatingOrg ? "Creating..." : "Create organisation"}
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <>
              <DialogDescription>Pick an organisation, name the board and optionally link a repository.</DialogDescription>
              <form onSubmit={handleCreateBoard} className="mt-5 space-y-4">
                <Field label="Organisation" htmlFor="board-org">
                  <Select id="board-org" value={selectedOrgId} onChange={(e) => setSelectedOrgId(e.target.value)}>
                    {orgs.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Board title" htmlFor="board-title">
                  <Input
                    id="board-title"
                    value={boardTitle}
                    onChange={(e) => setBoardTitle(e.target.value)}
                    disabled={creatingBoard}
                    autoFocus
                  />
                </Field>
                <Field label="GitHub repository" htmlFor="board-repo" hint="Optional. Format: owner/name">
                  <Input
                    id="board-repo"
                    value={boardRepository}
                    onChange={(e) => setBoardRepository(e.target.value)}
                    placeholder="owner/name"
                    disabled={creatingBoard}
                    className="font-mono text-compact"
                  />
                </Field>
                <div className="flex justify-end gap-2 pt-1">
                  <DialogClose asChild>
                    <Button type="button" variant="secondary">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button type="submit" variant="primary" disabled={creatingBoard}>
                    {creatingBoard ? "Creating..." : "Create board"}
                  </Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogTitle>Edit board</DialogTitle>
          <form onSubmit={handleRename} className="mt-5 space-y-4">
            <Field label="Board title" htmlFor="rename-title">
              <Input
                id="rename-title"
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                disabled={renaming}
                autoFocus
              />
            </Field>
            <Field label="Description" htmlFor="rename-description" hint="Optional">
              <Input
                id="rename-description"
                value={renameDescription}
                onChange={(e) => setRenameDescription(e.target.value)}
                disabled={renaming}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" variant="primary" disabled={renaming}>
                {renaming ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
