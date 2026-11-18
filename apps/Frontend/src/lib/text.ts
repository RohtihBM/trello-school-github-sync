// GitHub issue bodies are markdown. Cards show a short preview, so strip the
// syntax first — otherwise the preview reads "**Acceptance criteria** - Refund…".
export function plainPreview(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/(\*\*|__|\*|_)(.+?)\1/g, "$2")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
