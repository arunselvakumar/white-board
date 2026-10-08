import { randomUUID } from "node:crypto";

import { getCompanyAuthFromHeaders } from "@repo/auth/construction/server";
import { companyAuthStateFor } from "@repo/auth/construction/testing";
import { prisma } from "@repo/db";
import { vi } from "vitest";

import { createCompanyHandlers } from "@/src/organization/infrastructure/create-company-handlers";
import { createDesignationHandlers } from "@/src/organization/infrastructure/create-designation-handlers";
import { createTeamMemberHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";
import type { Flag } from "@/src/shared-kernel/access";

/**
 * A real Company (Workspace, profile, Designations, the Owner's Team
 * Member) with a fresh Owner. Mobiles are random so tests never collide.
 */
export async function newCompany(name = "Patil Builders"): Promise<{
  workspaceId: string;
  ownerId: string;
  ownerMobile: string;
}> {
  const ownerId = randomUUID();
  const ownerMobile = `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  await prisma.identityUser.create({
    data: {
      id: ownerId,
      name: "Ramesh Patil",
      email: `${ownerId}@example.test`,
    },
  });
  const { workspaceId } = await createCompanyHandlers().create.execute({
    name,
    country: "IN",
    userId: ownerId,
    userName: "Ramesh Patil",
    userMobile: ownerMobile,
    userEmail: null,
  });
  return { workspaceId, ownerId, ownerMobile };
}

/**
 * An active Member of the Company with exactly these grants, as if they
 * had accepted their Join Request.
 */
export async function addMember(
  workspaceId: string,
  ownerId: string,
  permissions: Record<string, readonly Flag[]>,
  details: { aadhaar?: string; pan?: string; email?: string } = {},
): Promise<{ userId: string; memberId: string }> {
  const designations = await createDesignationHandlers().list(workspaceId);
  const designationId =
    designations.find((item) => item.name === "Site Engineer")?.id ?? "";
  const member = await createTeamMemberHandlers().invite({
    workspaceId,
    by: ownerId,
    memberType: "normal",
    details: {
      name: "Suresh Kale",
      designationId,
      mobile: `+9197${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
      ...details,
    },
    permissions,
  });
  const userId = randomUUID();
  await prisma.constructionOrganizationTeamMember.update({
    where: { id: member.id },
    data: {
      userId,
      status: "active",
      joinedAt: new Date(),
      inviteToken: null,
    },
  });
  return { userId, memberId: member.id };
}

/**
 * Signs requests in as this User in this Company. The test file must mock
 * `getCompanyAuthFromHeaders` from `@repo/auth/construction/server`.
 */
export function actAs(input: {
  userId: string | null;
  workspaceId: string | null;
  role?: "owner" | "member";
}): void {
  vi.mocked(getCompanyAuthFromHeaders).mockResolvedValue(
    companyAuthStateFor(input),
  );
}
