import { protectCompany } from "@repo/auth/construction/server";
import { prisma } from "@repo/construction-db";

import { homePathFor } from "@/lib/home-path";
import { PrismaEmployeeDirectory } from "@/src/hrms/infrastructure/prisma-directories";

/**
 * The signed-in Team Member's home (CM-318): Workspace → HRMS for an HRMS
 * Team Member, the Projects home for everyone else (the Owner included).
 */
export async function viewerHomePath(): Promise<string> {
  const auth = await protectCompany();
  if (auth.workspaceId == null || auth.role !== "member")
    return homePathFor(null);
  const member = await new PrismaEmployeeDirectory(prisma).findByUserId(
    auth.workspaceId,
    auth.userId,
  );
  return homePathFor(member?.memberType ?? null);
}
