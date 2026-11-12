import { Router } from "express";
import { Prisma, prisma, Role } from "@repo/db";
import { requireAuth } from "../middleware/auth.js";
import { getMembershipForOrg } from "../lib/authz.js";

export const inviteRouter = Router();

inviteRouter.post("/invite", requireAuth, async (req, res) => {
  const { email, orgId, role } = req.body;

  if (typeof email !== "string" || typeof orgId !== "string") {
    return res.status(400).json({ error: "email and orgId are required" });
  }

  const inviteRole: Role = role === "ADMIN" ? "ADMIN" : "MEMBER";

  const callerMembership = await getMembershipForOrg(req.userId!, orgId);

  if (!callerMembership || callerMembership.role !== "ADMIN") {
    return res
      .status(403)
      .json({ error: "only admins can invite members to this organisation" });
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    try {
      await prisma.membership.create({
        data: {
          userId: existingUser.id,
          orgId,
          role: inviteRole,
          accepted: false,
        },
      });
      return res.status(201).json({ status: "added", accepted: false });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return res.status(409).json({ error: "already a member" });
      }
      throw err;
    }
  }

  await prisma.pendingInvite.upsert({
    where: { email_orgId: { email, orgId } },
    update: { role: inviteRole },
    create: { email, orgId, role: inviteRole },
  });

  res.status(201).json({ status: "pending" });
});

inviteRouter.post("/memberships/:id/accept", requireAuth, async (req, res) => {
  const id = req.params.id as string;

  const membership = await prisma.membership.findUnique({ where: { id } });

  if (!membership) {
    return res.status(404).json({ error: "membership not found" });
  }

  if (membership.userId !== req.userId) {
    return res
      .status(403)
      .json({ error: "you cannot accept someone else's invite" });
  }

  if (membership.accepted) {
    return res.json(membership);
  }

  const updated = await prisma.membership.update({
    where: { id },
    data: { accepted: true },
  });

  res.json(updated);
});

inviteRouter.delete("/memberships/:id", requireAuth, async (req, res) => {
  const id = req.params.id as string;

  const membership = await prisma.membership.findUnique({ where: { id } });
  if (!membership) {
    return res.status(404).json({ error: "membership not found" });
  }

  const isSelf = membership.userId === req.userId;

  if (!isSelf) {
    const callerMembership = await getMembershipForOrg(
      req.userId!,
      membership.orgId,
    );
    if (!callerMembership || callerMembership.role !== "ADMIN") {
      return res.status(403).json({
        error: "only the member themself or an org admin can remove this membership",
      });
    }
  }

  await prisma.membership.delete({ where: { id } });
  res.status(204).send();
});
