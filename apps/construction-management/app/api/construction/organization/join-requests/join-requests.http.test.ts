import { randomUUID } from "node:crypto";

import { companies } from "@repo/auth/construction/server";
import { outbox, smsOutbox } from "@repo/auth/construction/testing";
import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createCompanyHandlers } from "@/src/organization/infrastructure/create-company-handlers";
import { createDesignationHandlers } from "@/src/organization/infrastructure/create-designation-handlers";
import { createTeamMemberHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";
import { can } from "@/src/shared-kernel/access";
import {
  newEmail,
  newMobile,
  signInByEmail,
  signInByMobile,
  TEST_ORIGIN,
  withSms,
} from "@/test/sessions";

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
      name: "Arun Selva Kumar",
      email: `${ownerId}@example.test`,
    },
  });
  const { workspaceId } = await createCompanyHandlers().create.execute({
    name: "Anugraha Engineers",
    country: "IN",
    userId: ownerId,
    userName: "Arun Selva Kumar",
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

type Preview = {
  companyName: string;
  contacts: { kind: string; masked: string }[];
};

async function previewOf(token: string): Promise<Response> {
  return previewLink(new Request(`${BASE}/join-links/${token}`), {
    params: Promise.resolve({ token }),
  });
}

function acceptAs(cookie: string, id: string): Promise<Response> {
  return accept(
    new Request(`${BASE}/join-requests/${id}/accept`, {
      method: "POST",
      headers: { cookie },
    }),
    { params: Promise.resolve({ id }) },
  );
}

function listAs(cookie: string): Promise<Response> {
  return listRequests(
    new Request(`${BASE}/join-requests`, { headers: { cookie } }),
  );
}

/** The invitation emailed to `email` (not a sign-in code). */
function invitationTo(email: string) {
  return outbox.filter(
    (mail) => mail.to === email && mail.text.includes("/join/"),
  );
}

describe("Join Requests (CM-109), SMS off (ADR CM-0009)", () => {
  const members = createTeamMemberHandlers();

  beforeEach(() => {
    outbox.length = 0;
    smsOutbox.length = 0;
  });

  it("invite → the invitee sees it, accepts, and works in the Company", async () => {
    const { workspaceId, ownerId, engineerId } = await ownerCompany();
    const email = newEmail();
    const invited = await members.invite({
      workspaceId,
      by: ownerId,
      memberType: "normal",
      details: {
        name: "Prabhu Saravanan",
        designationId: engineerId,
        mobile: newMobile(),
        email,
      },
      projectIds: ["project-a"],
    });

    // The invitation went out by email with the join link; no SMS, even
    // though the member has a mobile.
    const link = `${TEST_ORIGIN}${invited.invitePath ?? ""}`;
    expect(invitationTo(email)).toHaveLength(1);
    expect(invitationTo(email)[0]?.text).toContain(link);
    expect(smsOutbox).toEqual([]);

    // The link previews without a Session, masked, listing only the email.
    const token = invited.invitePath?.split("/").at(-1) ?? "";
    const preview = await json<Preview>(await previewOf(token));
    expect(preview.companyName).toBe("Anugraha Engineers");
    expect(preview.contacts).toEqual([
      { kind: "email", masked: `u••••@${email.split("@")[1] ?? ""}` },
    ]);

    const { cookie, userId } = await signInByEmail(email, "Prabhu Saravanan");
    const listed = await json<Requests>(await listAs(cookie));
    expect(listed.items).toEqual([
      expect.objectContaining({
        id: invited.id,
        companyName: "Anugraha Engineers",
        memberName: "Prabhu Saravanan",
      }),
    ]);

    const accepted = await acceptAs(cookie, invited.id);
    expect(accepted.status).toBe(StatusCodes.OK);
    await expect(companies.listForUser(userId)).resolves.toEqual([
      { id: workspaceId, name: "Anugraha Engineers", role: "member" },
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
    expect((await previewOf(token)).status).toBe(StatusCodes.NOT_FOUND);
    expect(smsOutbox).toEqual([]);
  });

  it("sends nothing to a member with only a mobile", async () => {
    const { workspaceId, ownerId, engineerId } = await ownerCompany();
    const invited = await members.invite({
      workspaceId,
      by: ownerId,
      memberType: "normal",
      details: {
        name: "Prabhu",
        designationId: engineerId,
        mobile: newMobile(),
      },
    });
    expect(smsOutbox).toEqual([]);
    expect(outbox).toEqual([]);
    const token = invited.invitePath?.split("/").at(-1) ?? "";
    const preview = await json<Preview>(await previewOf(token));
    expect(preview.contacts).toEqual([]);
  });

  it("does not show or accept a request for someone else", async () => {
    const { workspaceId, ownerId, engineerId } = await ownerCompany();
    const invited = await members.invite({
      workspaceId,
      by: ownerId,
      memberType: "normal",
      details: {
        name: "Prabhu",
        designationId: engineerId,
        email: newEmail(),
      },
    });
    const { cookie } = await signInByEmail();
    const listed = await json<Requests>(await listAs(cookie));
    expect(listed.items).toEqual([]);
    const refused = await acceptAs(cookie, invited.id);
    expect(refused.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json(refused)).toMatchObject({
      code: "JOIN_REQUEST_NOT_FOUND",
    });
  });

  it("a rejected request closes; a resent one can be accepted", async () => {
    const { workspaceId, ownerId, engineerId } = await ownerCompany();
    const email = newEmail();
    const invited = await members.invite({
      workspaceId,
      by: ownerId,
      memberType: "normal",
      details: { name: "Prabhu", designationId: engineerId, email },
    });
    const { cookie, userId } = await signInByEmail(email);
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
    expect(invitationTo(email)).toHaveLength(2);
    const accepted = await acceptAs(cookie, invited.id);
    expect(accepted.status).toBe(StatusCodes.OK);
  });

  it("lets a User be in several Companies and switch", async () => {
    const email = newEmail();
    const first = await ownerCompany();
    const second = await ownerCompany();
    const a = await members.invite({
      workspaceId: first.workspaceId,
      by: first.ownerId,
      memberType: "normal",
      details: { name: "Prabhu", designationId: first.engineerId, email },
    });
    const b = await members.invite({
      workspaceId: second.workspaceId,
      by: second.ownerId,
      memberType: "hrms",
      details: { name: "Prabhu", designationId: second.engineerId, email },
    });
    const { cookie, userId } = await signInByEmail(email);
    for (const id of [a.id, b.id]) await acceptAs(cookie, id);
    await expect(companies.listForUser(userId)).resolves.toHaveLength(2);
  });
});

describe("Join Requests (CM-109), SMS on (ADR CM-0009)", () => {
  const members = createTeamMemberHandlers();
  const sms = withSms();
  beforeAll(sms.on);
  afterAll(sms.off);

  beforeEach(() => {
    outbox.length = 0;
    smsOutbox.length = 0;
  });

  it("texts the invitation, lists the mobile, and matches by mobile", async () => {
    const { workspaceId, ownerId, engineerId } = await ownerCompany();
    const mobile = newMobile();
    const email = newEmail();
    const invited = await members.invite({
      workspaceId,
      by: ownerId,
      memberType: "normal",
      details: {
        name: "Prabhu Saravanan",
        designationId: engineerId,
        mobile,
        email,
      },
    });

    const link = `${TEST_ORIGIN}${invited.invitePath ?? ""}`;
    expect(smsOutbox.at(-1)).toMatchObject({ to: mobile, link });
    expect(invitationTo(email)[0]?.text).toContain(link);

    const token = invited.invitePath?.split("/").at(-1) ?? "";
    const preview = await json<Preview>(await previewOf(token));
    expect(preview.contacts).toEqual([
      { kind: "mobile", masked: `+91 ••••• ${mobile.slice(-5)}` },
      { kind: "email", masked: `u••••@${email.split("@")[1] ?? ""}` },
    ]);

    const { cookie, userId } = await signInByMobile(mobile);
    expect((await acceptAs(cookie, invited.id)).status).toBe(StatusCodes.OK);
    await expect(companies.listForUser(userId)).resolves.toEqual([
      { id: workspaceId, name: "Anugraha Engineers", role: "member" },
    ]);
  });
});
