import { prisma } from "@repo/db";

export function getMembershipForOrg(userId: string, orgId: string) {
  return prisma.membership.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });
}
