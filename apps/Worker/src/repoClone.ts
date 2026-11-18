import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { parseGitHubRepo } from "@repo/db";

const exec = promisify(execFile);

export interface RepoRef {
  fullName: string; // "owner/name"
  cloneUrl: string;
}

// process.cwd(), not import.meta.dirname — this app (like Backend and
// Websockets) doesn't set "type": "module" in package.json, so import.meta
// isn't available under tsc's NodeNext output. npm run --workspace=worker
// always runs with cwd set to this app's own directory, so this is reliable.
const CACHE_ROOT = path.resolve(process.cwd(), ".repo-cache");

// One folder per repository, so two boards pointing at different repositories
// never see each other's code.
export function repoDir(fullName: string): string {
  return path.join(CACHE_ROOT, fullName.replace("/", "__"));
}

// One shared clone per repository, refreshed before each use: every ticket on
// a board reasons about the SAME current code, so there is nothing to isolate
// per ticket. Public repositories only for now — cloning needs no credentials.
// A private one would need the GitHub App's installation access token.
export async function ensureRepoCloned(repo: RepoRef): Promise<string> {
  // The name and URL come from the database, but they are re-checked here
  // because they end up in a file path and a `git clone` command.
  const parsed = parseGitHubRepo(repo.fullName);
  if (!parsed || parsed.cloneUrl !== repo.cloneUrl) {
    throw new Error(`refusing to clone an unexpected repository: ${repo.fullName}`);
  }

  const dir = repoDir(parsed.fullName);
  if (existsSync(path.join(dir, ".git"))) {
    // Shallow: only the latest commit is needed to read the current code.
    await exec("git", ["fetch", "--depth", "1", "origin", "HEAD"], { cwd: dir });
    await exec("git", ["reset", "--hard", "FETCH_HEAD"], { cwd: dir });
  } else {
    await mkdir(CACHE_ROOT, { recursive: true });
    await exec("git", ["clone", "--depth", "1", "--", parsed.cloneUrl, dir]);
  }
  return dir;
}
