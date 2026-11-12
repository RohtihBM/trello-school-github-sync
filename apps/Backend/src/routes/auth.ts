import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Prisma, prisma } from "@repo/db";
import { getJwtSecret } from "../lib/jwt.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

// Never existed before — the JWT only ever carried userId, never email,
// so the frontend had no way to know the signed-in user's own identity
// anywhere outside a board's live presence list (which only shows it
// incidentally, while connected to that board's socket). Needed for the
// new sidebar, which shows the current user on every authenticated page.
authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { id: true, email: true },
  });
  if (!user) {
    return res.status(404).json({ error: "user not found" });
  }
  res.json(user);
});

authRouter.post("/signup", async (req, res) => {
  const { email, password } = req.body;

  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "email and password are required" });
  }

  if (password.length < 8) {
    return res
      .status(400)
      .json({ error: "password must be at least 8 characters" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email, password: hashedPassword },
        select: { id: true, email: true, createdAt: true },
      });

      const pendingInvites = await tx.pendingInvite.findMany({
        where: { email },
      });

      if (pendingInvites.length > 0) {
        await tx.membership.createMany({
          data: pendingInvites.map((invite) => ({
            userId: created.id,
            orgId: invite.orgId,
            role: invite.role,
            accepted: false,
          })),
        });
        await tx.pendingInvite.deleteMany({ where: { email } });
      }

      return created;
    });

    res.status(201).json(user);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return res.status(409).json({ error: "email already in use" });
    }
    throw err;
  }
});

authRouter.post("/signin", async (req, res) => {
  const { email, password } = req.body;

  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "email and password are required" });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "invalid credentials" });
  }

  const token = jwt.sign({ userId: user.id }, getJwtSecret(), {
    expiresIn: "7d",
  });

  res.json({ token });
});
