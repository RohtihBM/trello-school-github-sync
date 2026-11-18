import type { Components } from "react-markdown";

// Shared by both the plan and the ticket description — both are markdown-ish
// free text, so both get the same real heading/list/code rendering.
//
// Headings get real weight and spacing, so a plan with several sections is
// scannable instead of one undifferentiated block. Body size is inherited
// from the container (0.8125rem), so the same markup serves the description,
// the plan and chat replies.
// Each component drops react-markdown's `node` and `ref` props before spreading the
// rest onto a plain element: their types do not match the element they render to.
export const MARKDOWN_COMPONENTS: Components = {
  h1: ({ node: _node, ref: _ref, ...p }) => <p className="mb-2 mt-6 font-display text-[1.5rem] leading-7 tracking-[-0.015em] text-foreground first:mt-0" {...p} />,
  h2: ({ node: _node, ref: _ref, ...p }) => <p className="mb-2 mt-6 font-display text-[1.375rem] leading-7 tracking-[-0.015em] text-foreground first:mt-0" {...p} />,
  h3: ({ node: _node, ref: _ref, ...p }) => <p className="type-eyebrow mb-2 mt-5 text-neutral-600 first:mt-0" {...p} />,
  p: ({ node: _node, ref: _ref, ...p }) => <p className="mb-2.5 leading-[1.5rem] last:mb-0" {...p} />,
  ul: ({ node: _node, ref: _ref, ...p }) => <ul className="mb-2.5 list-disc space-y-1 pl-5 marker:text-neutral-400 last:mb-0" {...p} />,
  ol: ({ node: _node, ref: _ref, ...p }) => <ol className="mb-2.5 list-decimal space-y-1 pl-5 marker:text-neutral-400 last:mb-0" {...p} />,
  li: ({ node: _node, ref: _ref, ...p }) => <li className="pl-0.5 leading-[1.5rem]" {...p} />,
  strong: ({ node: _node, ref: _ref, ...p }) => <strong className="font-semibold text-foreground" {...p} />,
  code: ({ node: _node, ref: _ref, ...p }) => <code className="rounded-md bg-neutral-900/[0.06] px-1.5 py-0.5 font-mono text-[0.75rem] text-neutral-800" {...p} />,
  pre: ({ node: _node, ref: _ref, ...p }) => (
    <pre
      tabIndex={0}
      className="mb-2.5 overflow-x-auto rounded-lg bg-neutral-950 p-3.5 font-mono text-xs leading-5 text-neutral-100 ring-1 ring-white/5 last:mb-0 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit"
      {...p}
    />
  ),
  a: ({ node: _node, ref: _ref, ...p }) => <a className="text-foreground underline decoration-accent-400 decoration-2 underline-offset-2 transition-colors hover:text-accent-700" {...p} />,
};
