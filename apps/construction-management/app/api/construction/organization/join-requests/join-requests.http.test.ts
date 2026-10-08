import { randomUUID } from "node:crypto";

import { companies } from "@repo/auth/construction/server";
import { outbox, smsOutbox } from "@repo/auth/construction/testing";
import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";
import { beforeEach, describe, expect, it } from "vitest";

import { createCompanyHandlers } from "@/src/organization/infrastructure/create-company-handlers";
import { createDesignationHandlers } from "@/src/organization/infrastructure/create-designation-handlers";
import { createTeamMemberHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";
import { can } from "@/src/shared-kernel/access";
import { newMobile, signInByMobile, TEST_ORIGIN } from "@/test/sessions";

import { GET as previewLink } from "../join-links/[token]/route";
import { POST as accept } from "./[id]/accept/route";
import { POST as reject } from "./[id]/reject/route";
import { GET as listRequests } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/organization`;

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function ownerCompany() {
  const ownerId = randomUUID();
  await prisma.identityUser.create({
    data: {
      id: ownerId,
      name: "Ramesh Patil",
      email: `${ownerId}@example.test`,
    },
  });
  const { workspaceId } = await createCompanyHandlers().create.execute({
    name: "Patil Builders",
    country: "IN",
    userId: ownerId,
    userName: "Ramesh Patil",
    userMobile: null,
    userEmail: `${ownerId}@example.test`,
  });
  const designations = await createDesignationHandlers().list(workspaceId);
  const engineer = designations.find((item) => item.name === "Site Engineer");
  return { workspaceId, ownerId, engineerId: engineer?.id ?? "" };
}

type Requests = {
  items: { id: string; companyName: string; memberName: string }[];
};

describe("Join Requests (CM-109)", () => {
  const members = createTeamMemberHandlers();

  beforeEach(() => {
    outbox.length = 0;
    smsOutbox.length = 0;
  });

  it("invite → the invitee sees it, accepts, and works in the Company", async () => {
    const { workspaceId, ownerId, engineerId } = await ownerCompany();
    const mobile = newMobile();
    const invited = await members.invite({
      workspaceId,
      by: ownerId,
      memberType: "normal",
      details: {
        name: "Suresh Kale",
        designationId: engineerId,
        mobile,
        email: "suresh@kale.in",
      },
      projectIds: ["project-a"],
    });

    // The invitation went out by SMS and email with the join link.
    const link = `${TEST_ORIGIN}${invited.invitePath ?? ""}`;
    expect(smsOutbox.at(-1)).toMatchObject({ to: mobile, link });
    expect(outbox.at(-1)?.to).toBe("suresh@kale.in");
    expect(outbox.at(-1)?.text).toContain(link);

    // The link previews without a Session, masked.
    const token = invited.invitePath?.split("/").at(-1) ?? "";
    const preview = await json<{
      companyName: string;
      contacts: { kind: string; masked: string }[];
    }>(
      await previewLink(new Request(`${BASE}/join-links/${token}`), {
        params: Promise.resolve({ token }),
      }),
    );
    expect(preview.companyName).toBe("Patil Builders");
    expect(preview.contacts[0]).toEqual({
      kind: "mobile",
      masked: `+91 ••••• ${mobile.slice(-5)}`,
    });

    const { cookie, userId } = await signInByMobile(mobile);
    const listed = await json<Requests>(
      await listRequests(
        new Request(`${BASE}/join-requests`, { headers: { cookie } }),
      ),
    );
    expect(listed.items).toEqual([
      expect.objectContaining({
        id: invited.id,
        companyName: "Patil Builders",
        memberName: "Suresh Kale",
      }),
    ]);

    const accepted = await accept(
      new Request(`${BASE}/join-requests/${invited.id}/accept`, {
        method: "POST",
        headers: { cookie },
      }),
      { params: Promise.resolve({ id: invited.id }) },
    );
    expect(accepted.status).toBe(StatusCodes.OK);
    await expect(companies.listForUser(userId)).resolves.toEqual([
      { id: workspaceId, name: "Patil Builders", role: "member" },
    ]);
    const session = await prisma.identitySession.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    expect(session?.activeOrganizationId).toBe(workspaceId);

    const access = await loadMemberAccess(prisma, {
      workspaceId,
      userId,
      role: "member",
    });
    expect(
      can(access, "site_work.daily_worksheet", "create", {
        projectId: "project-a",
      }),
    ).toBe(true);
    const member = await members.get(workspaceId, invited.id);
    expect(member).toMatchObject({
      status: "active",
      userId,
      invitePath: null,
    });

    // The link is spent.
    const spent = await previewLink(
      new Request(`${BASE}/join-links/${token}`),
      {
        params: Promise.resolve({ token }),
      },
    );
    expect(spent.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("does not show or accept a request for someone else", async () => {
    const { workspaceId, ownerId, engineerId } = await ownerCompany();
    const invited = await members.invite({
      workspaceId,
      by: ownerId,
      memberType: "normal",
      details: {
        name: "Suresh",
        designationId: engineerId,
        mobile: newMobile(),
      },
    });
    const { cookie } = await signInByMobile();
    const listed = await json<Requests>(
      await listRequests(
        new Request(`${BASE}/join-requests`, { headers: { cookie } }),
      ),
    );
    expect(listed.items).toEqual([]);
    const refused = await accept(
      new Request(`${BASE}/join-requests/${invited.id}/accept`, {
        method: "POST",
        headers: { cookie },
      }),
      { params: Promise.resolve({ id: invited.id }) },
    );
    expect(refused.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json(refused)).toMatchObject({
      code: "JOIN_REQUEST_NOT_FOUND",
    });
  });

  it("a rejected request closes; a resent one can be accepted", async () => {
    const { workspaceId, ownerId, engineerId } = await ownerCompany();
    const mobile = newMobile();
    const invited = await members.invite({
      workspaceId,
      by: ownerId,
      memberType: "normal",
      details: { name: "Suresh", designationId: engineerId, mobile },
    });
    const { cookie, userId } = await signInByMobile(mobile);
    const rejected = await reject(
      new Request(`${BASE}/join-requests/${invited.id}/reject`, {
        method: "POST",
        headers: { cookie },
      }),
      { params: Promise.resolve({ id: invited.id }) },
    );
    expect(rejected.status).toBe(StatusCodes.NO_CONTENT);
    await expect(members.get(workspaceId, invited.id)).resolves.toMatchObject({
      status: "rejected",
    });
    await expect(companies.listForUser(userId)).resolves.toEqual([]);

    await members.resendInvite({ workspaceId, id: invited.id, by: ownerId });
    const accepted = await accept(
      new Request(`${BASE}/join-requests/${invited.id}/accept`, {
        method: "POST",
        headers: { cookie },
      }),
      { params: Promise.resolve({ id: invited.id }) },
    );
    expect(accepted.status).toBe(StatusCodes.OK);
  });

  it("lets a User be in several Companies and switch", async () => {
    const mobile = newMobile();
    const first = await ownerCompany();
    const second = await ownerCompany();
    const a = await members.invite({
      workspaceId: first.workspaceId,
      by: first.ownerId,
      memberType: "normal",
      details: { name: "Suresh", designationId: first.engineerId, mobile },
    });
    const b = await members.invite({
      workspaceId: second.workspaceId,
      by: second.ownerId,
      memberType: "hrms",
      details: { name: "Suresh", designationId: second.engineerId, mobile },
    });
    const { cookie, userId } = await signInByMobile(mobile);
    for (const id of [a.id, b.id])
      await accept(
        new Request(`${BASE}/join-requests/${id}/accept`, {
          method: "POST",
          headers: { cookie },
        }),
        { params: Promise.resolve({ id }) },
      );
    await expect(companies.listForUser(userId)).resolves.toHaveLength(2);
  });
});
