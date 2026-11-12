// A transient DB hiccup (Neon's auto-suspend cold start is the one we've
// actually hit repeatedly in this project) throws from deep inside some
// async call that isn't always wrapped in a try/catch at the call site —
// outside an Express request handler, Node's default behavior for an
// unhandled rejection is to crash the whole process. That's what was
// silently killing Websockets/Worker over and over: not the terminal tab
// closing, but a single failed query taking the entire process down with
// it. Log and keep running instead — pm2 (see ecosystem.config.cjs) is the
// remaining safety net for any crash this doesn't catch.
export function installCrashGuard(serviceName: string) {
  process.on("unhandledRejection", (reason) => {
    console.error(`[${serviceName}] unhandled rejection (process kept alive):`, reason);
  });
  process.on("uncaughtException", (err) => {
    console.error(`[${serviceName}] uncaught exception (process kept alive):`, err);
  });
}
