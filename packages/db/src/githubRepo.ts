export interface GitHubRepoRef {
  fullName: string; // "owner/name"
  cloneUrl: string; // https://github.com/owner/name.git
}

// GitHub user and repository names: letters, digits, dot, dash, underscore.
const NAME = /^[A-Za-z0-9_.-]{1,100}$/;

// Accepts "owner/name", "https://github.com/owner/name" or the same with a
// trailing ".git" or slash, and returns null for anything else. This value is
// later used in a file path and a `git clone` command, so only github.com
// over https and plain names are allowed: no other hosts, no extra path
// segments, no ".." tricks.
export function parseGitHubRepo(input: string): GitHubRepoRef | null {
  const raw = input.trim().replace(/\/+$/, "").replace(/\.git$/i, "");

  let ownerAndName: string | undefined;
  const asUrl = raw.match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)$/i);
  if (asUrl) {
    ownerAndName = `${asUrl[1]}/${asUrl[2]}`;
  } else if (/^[^/\s:]+\/[^/\s:]+$/.test(raw)) {
    ownerAndName = raw;
  }
  if (!ownerAndName) return null;

  const [owner, name] = ownerAndName.split("/");
  if (!owner || !name) return null;
  if (!NAME.test(owner) || !NAME.test(name)) return null;
  if (owner === "." || owner === ".." || name === "." || name === "..") return null;

  return { fullName: `${owner}/${name}`, cloneUrl: `https://github.com/${owner}/${name}.git` };
}
