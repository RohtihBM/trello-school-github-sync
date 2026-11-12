import "dotenv/config";
import express from "express";
import cors from "cors";
import { installCrashGuard } from "@repo/db";
import { authRouter } from "./routes/auth.js";
import { orgRouter } from "./routes/org.js";
import { boardRouter } from "./routes/board.js";
import { inviteRouter } from "./routes/invite.js";
import { githubRouter } from "./routes/github.js";
import { planRouter } from "./routes/plan.js";
import { dependencyRouter } from "./routes/dependency.js";
import { approvalRouter } from "./routes/approval.js";
import { assigneeRouter } from "./routes/assignee.js";

installCrashGuard("Backend");

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());

// Mounted BEFORE express.json(): GitHub's webhook signature must be verified
// against the exact raw bytes of the request body. If express.json() parsed
// it first, the raw bytes would already be gone by the time this route ran.
app.use(githubRouter);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(authRouter);
app.use(orgRouter);
app.use(boardRouter);
app.use(inviteRouter);
app.use(planRouter);
app.use(dependencyRouter);
app.use(approvalRouter);
app.use(assigneeRouter);

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
