import type { Components } from "react-markdown";

// Shared by both the plan and the ticket description — both are
// markdown-ish free text (a GitHub issue body with a bulleted
// "Acceptance criteria" list is exactly as structured as a generated
// plan), so both deserve the same real heading/list/code rendering
// instead of one being plain-text-dumped while the other gets styled.
//
// Headings get real visual weight — a border-left accent plus a
// size/weight jump from body text, not just a slightly-bolder
// paragraph. This is the concrete fix for "scannable": without it, text
// with several sections reads as one undifferentiated block, and
// finding "the acceptance criteria" means reading everything.
export const MARKDOWN_COMPONENTS: Components = {
  h1: (p) => (
    <p
      className="mb-1.5 mt-3 border-l-2 border-accent-400 pl-2 text-sm font-semibold text-foreground first:mt-0"
      {...p}
    />
  ),
  h2: (p) => (
    <p
      className="mb-1.5 mt-3 border-l-2 border-accent-400 pl-2 text-sm font-semibold text-foreground first:mt-0"
      {...p}
    />
  ),
  h3: (p) => <p className="mb-1 mt-2.5 text-xs font-semibold text-foreground first:mt-0" {...p} />,
  p: (p) => <p className="mb-1.5 leading-relaxed last:mb-0" {...p} />,
  ul: (p) => <ul className="mb-1.5 list-disc space-y-1 pl-4 last:mb-0" {...p} />,
  ol: (p) => <ol className="mb-1.5 list-decimal space-y-1 pl-4 last:mb-0" {...p} />,
  li: (p) => <li {...p} />,
  strong: (p) => <strong className="font-semibold text-foreground" {...p} />,
  code: (p) => <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.7rem]" {...p} />,
  pre: (p) => (
    <pre
      tabIndex={0}
      className="mb-1.5 overflow-x-auto rounded bg-neutral-900 p-2 font-mono text-[0.7rem] text-neutral-100 last:mb-0"
      {...p}
    />
  ),
  a: (p) => <a className="text-accent-600 underline" {...p} />,
};
