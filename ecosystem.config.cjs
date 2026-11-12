// Runs every dev service under pm2 instead of plain `tsx watch`/`vite` in
// separate terminal tabs. The actual problem this fixes: each service was
// dying independently and silently — closing/sleeping its terminal tab
// killed it outright (no supervisor to restart it), and an unhandled error
// (e.g. a Neon cold-start query failure) could crash the whole Node
// process (see packages/db/src/crashGuard.ts for the other half of this
// fix). pm2 runs these as detached background processes that survive
// terminal closure and auto-restart on any crash that still gets through.
//
// Usage:
//   npx pm2 start ecosystem.config.cjs   # start everything
//   npx pm2 status                       # see what's running
//   npx pm2 logs                         # tail all logs (or: pm2 logs Backend)
//   npx pm2 restart all                  # restart everything
//   npx pm2 stop all                     # stop everything
const fs = require("node:fs");
const path = require("node:path");

// `node_modules/.bin/tsx` and `.bin/vite` are symlinks. pm2 decides
// require() vs dynamic import() by walking up from the SCRIPT PATH it's
// given looking for the nearest package.json's "type": "module" — given
// the symlink path itself, that walk starts in node_modules/.bin/, which
// has no package.json of its own, so it never finds tsx's/vite's real
// package.json and wrongly treats both as CommonJS (ERR_REQUIRE_ESM
// crash-loop). Resolving to the real target path first fixes it: it
// either ends in .mjs directly (tsx) or the walk starts inside the
// package's own directory, where "type": "module" actually is (vite).
const TSX = fs.realpathSync(path.join(__dirname, "node_modules", ".bin", "tsx"));
const VITE = fs.realpathSync(path.join(__dirname, "node_modules", ".bin", "vite"));

// `interpreter: "node"` is required on this machine: pm2 defaults to
// `process.execPath`, and Homebrew installs Node at a path containing a
// literal "@" (.../Cellar/node@22/22.11.0/bin/node) — pm2 misparses that
// as its own `interpreter@version` auto-install syntax and crashes trying
// to `nvm install` the garbled remainder. Pinning the plain "node" command
// (already on PATH) skips that auto-detection entirely.
module.exports = {
  apps: [
    {
      name: "Backend",
      cwd: path.join(__dirname, "apps/Backend"),
      script: TSX,
      args: "watch src/index.ts",
      interpreter: "node",
      autorestart: true,
      restart_delay: 2000,
    },
    {
      name: "Websockets",
      cwd: path.join(__dirname, "apps/Websockets"),
      script: TSX,
      args: "watch src/index.ts",
      interpreter: "node",
      autorestart: true,
      restart_delay: 2000,
    },
    {
      name: "Worker",
      cwd: path.join(__dirname, "apps/Worker"),
      script: TSX,
      args: "watch src/index.ts",
      interpreter: "node",
      autorestart: true,
      restart_delay: 2000,
    },
    {
      name: "Frontend",
      cwd: path.join(__dirname, "apps/Frontend"),
      script: VITE,
      interpreter: "node",
      autorestart: true,
      restart_delay: 2000,
    },
  ],
};
