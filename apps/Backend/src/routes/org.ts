import { Router } from "express";
import { prisma } from "@repo/db";
import { requireAuth } from "../middleware/auth.js";

export const orgRouter = Router();

// Never existed before — the frontend used to only ever show orgs
// created in the current browser session, so a real org a user already
// belongs to (e.g. the seeded "Demo Org") would silently vanish from
// any org picker after a page refresh. Mirrors GET /boards's own
// membership-scoping pattern exactly.
orgRouter.get("/organisations", requireAuth, async (req, res) => {
  const orgs = await prisma.org.findMany({
    where: { memberships: { some: { userId: req.userId! } } },
  });
  res.json(orgs);
});

orgRouter.post("/organisations", requireAuth, async (req, res) => {
  const { name, description } = req.body;

  if (typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "name is required" });
  }

  const org = await prisma.$transaction(async (tx) => {
    const created = await tx.org.create({
      data: {
        name,
        description: typeof description === "string" ? description : null,
      },
    });

    await tx.membership.create({
      data: {
        userId: req.userId!,
        orgId: created.id,
        role: "ADMIN",
        accepted: true,
      },
    });

    return created;
  });

  res.status(201).json(org);
});
