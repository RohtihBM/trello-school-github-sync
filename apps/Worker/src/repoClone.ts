import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const exec = promisify(execFile);

// Public repo — cloning needs zero credentials. If this were private, this
// would need the GitHub App's installation access token in the URL instead.
const REPO_URL =
  process.env.GITHUB_SYNC_REPO_URL ??
  "https://github.com/RohtihBM/trello-school-github-sync.git";

// process.cwd(), not import.meta.dirname — this app (like Backend and
// Websockets) doesn't set "type": "module" in package.json, so import.meta
// isn't available under tsc's NodeNext output. npm run --workspace=worker
// always runs with cwd set to this app's own directory, so this is reliable.
const REPO_DIR = path.resolve(process.cwd(), ".repo-cache/trello-school-github-sync");

// One shared clone for every ticket's plan generation (see the architecture
// doc §2 for why: every ticket is reasoning about the SAME current code, so
// there's nothing to isolate per ticket, unlike the auto-push version we cut).
export async function ensureRepoCloned(): Promise<string> {
  if (existsSync(path.join(REPO_DIR, ".git"))) {
    await exec("git", ["pull"], { cwd: REPO_DIR });
  } else {
    await mkdir(path.dirname(REPO_DIR), { recursive: true });
    await exec("git", ["clone", REPO_URL, REPO_DIR]);
  }
  return REPO_DIR;
}
