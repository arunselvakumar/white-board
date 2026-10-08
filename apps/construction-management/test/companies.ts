import { prisma } from "@repo/db";

import { POST as createCompanyRoute } from "@/app/api/construction/organization/companies/route";
import { createDesignationHandlers } from "@/src/organization/infrastructure/create-designation-handlers";
import { createTeamMemberHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";
import type { PermissionGrants } from "@/src/shared-kernel/access";

import { newMobile, signInByMobile, TEST_ORIGIN } from "./sessions";

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
