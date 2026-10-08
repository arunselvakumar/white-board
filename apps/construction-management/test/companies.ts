import { randomUUID } from "node:crypto";

import { getCompanyAuthFromHeaders } from "@repo/auth/construction/server";
import { companyAuthStateFor } from "@repo/auth/construction/testing";
import { prisma } from "@repo/db";
import { vi } from "vitest";

import { POST as createCompanyRoute } from "@/app/api/construction/organization/companies/route";
import { createCompanyHandlers } from "@/src/organization/infrastructure/create-company-handlers";
import { createDesignationHandlers } from "@/src/organization/infrastructure/create-designation-handlers";
import { createTeamMemberHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";
import type { Flag, PermissionGrants } from "@/src/shared-kernel/access";

import { newMobile, signInByMobile, TEST_ORIGIN } from "./sessions";

// Real sessions through the auth routes (HTTP tests of routes).

/**
 * An Owner signed in by mobile with a fresh Company active, plus helpers
 * to call routes as that Owner.
 */
export async function ownerWithCompany(name = "Patil Builders") {
  const owner = await signInByMobile();
  const created = await createCompanyRoute(
    new Request(`${TEST_ORIGIN}/api/construction/organization/companies`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: owner.cookie },
      body: JSON.stringify({ name, country: "IN" }),
    }),
  );
  if (!created.ok)
    throw new Error(`Company creation failed: ${String(created.status)}`);
  const { id: workspaceId } = (await created.json()) as { id: string };
  const designations = await createDesignationHandlers().list(workspaceId);
  const designationId = (designationName: string) => {
    const found = designations.find((item) => item.name === designationName);
    if (found == null) throw new Error(`No Designation ${designationName}`);
    return found.id;
  };
  return { ...owner, workspaceId, designationId };
}

/**
 * A second User who joined the Company as an active `member` with exactly
 * `permissions`. Their session has the Company active.
 */
export async function memberWith(
  company: {
    workspaceId: string;
    userId: string;
    designationId: (name: string) => string;
  },
  permissions: PermissionGrants,
) {
  const mobile = newMobile();
  const member = await createTeamMemberHandlers().invite({
    workspaceId: company.workspaceId,
    by: company.userId,
    memberType: "normal",
    details: {
      name: "Member",
      designationId: company.designationId("Site Engineer"),
      mobile,
    },
    permissions,
  });
  const session = await signInByMobile(mobile);
  await prisma.identityWorkspaceMember.create({
    data: {
      id: `member_${member.id}`,
      organizationId: company.workspaceId,
      userId: session.userId,
      role: "member",
      createdAt: new Date(),
    },
  });
  await prisma.constructionOrganizationTeamMember.update({
    where: { id: member.id },
    data: { status: "active", userId: session.userId, inviteToken: null },
  });
  await prisma.identitySession.updateMany({
    where: { userId: session.userId },
    data: { activeOrganizationId: company.workspaceId },
  });
  return { ...session, memberId: member.id };
}

export function jsonRequest(
  url: string,
  cookie: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Mocked sessions over real data (track D's helpers).

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
