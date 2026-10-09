import { companies } from "@repo/auth/construction/server";
import { StatusCodes } from "http-status-codes";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { newEmail, newMobile, TEST_ORIGIN, withSms } from "@/test/sessions";

import { POST as setPermissions } from "./[id]/permissions/route";
import { POST as assignProjects } from "./[id]/projects/route";
import { POST as remove } from "./[id]/remove/route";
import { POST as resend } from "./[id]/resend-invite/route";
import { POST as reveal } from "./[id]/reveal/route";
import { GET as getOne } from "./[id]/route";
import { POST as update } from "./[id]/update/route";
import { GET as list, POST as create } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/organization/team-members`;

type Member = {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  mobileLocked: boolean;
  status: string;
  memberType: string;
  projectIds: string[];
  permissions: Record<string, string[]>;
  aadhaarMasked: string | null;
  invitePath: string | null;
  designation: { name: string | null };
};
type Page = {
  items: Member[];
  total: number;
  nextCursor: string | null;
  prevCursor: string | null;
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("Team Members HTTP (CM-110)", () => {
  it("covers the Owner's whole flow", async () => {
    const owner = await ownerWithCompany();
    const projectA = await addProject(owner.workspaceId, owner.userId);
    const projectB = await addProject(owner.workspaceId, owner.userId);
    const created = await create(
      jsonRequest(BASE, owner.cookie, {
        name: "Suresh Kale",
        designationId: owner.designationId("Site Engineer"),
        email: newEmail(),
        aadhaar: "2341 2341 2346",
        memberType: "normal",
        projectIds: [projectA],
      }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const suresh = await json<Member>(created);
    expect(suresh).toMatchObject({
      status: "joining_pending",
      aadhaarMasked: "XXXXXXXX2346",
      designation: { name: "Site Engineer" },
    });
    expect(suresh.permissions["labour.attendance"]).toEqual([
      "create",
      "read",
      "update",
    ]);

    const permitted = await json<Member>(
      await setPermissions(
        jsonRequest(`${BASE}/${suresh.id}/permissions`, owner.cookie, {
          permissions: {
            "procurement.purchase_requests": ["create", "read", "delete"],
          },
        }),
        params(suresh.id),
      ),
    );
    expect(permitted.permissions).toEqual({
      "procurement.purchase_requests": ["create", "read", "delete"],
    });

    const moved = await json<Member>(
      await assignProjects(
        jsonRequest(`${BASE}/${suresh.id}/projects`, owner.cookie, {
          projectIds: [projectB],
        }),
        params(suresh.id),
      ),
    );
    expect(moved.projectIds).toEqual([projectB]);

    const hrms = await json<Member>(
      await update(
        jsonRequest(`${BASE}/${suresh.id}/update`, owner.cookie, {
          name: "Suresh K.",
          designationId: owner.designationId("Accountant"),
          email: (
            await json<{ email: string }>(
              await getOne(
                jsonRequest(`${BASE}/${suresh.id}`, owner.cookie),
                params(suresh.id),
              ),
            )
          ).email,
          memberType: "hrms",
        }),
        params(suresh.id),
      ),
    );
    expect(hrms).toMatchObject({
      name: "Suresh K.",
      memberType: "hrms",
      projectIds: [],
    });
    expect(Object.keys(hrms.permissions)).toContain("hrms.leaves");

    const resent = await json<Member>(
      await resend(
        jsonRequest(`${BASE}/${suresh.id}/resend-invite`, owner.cookie, {}),
        params(suresh.id),
      ),
    );
    expect(resent.invitePath).not.toBe(suresh.invitePath);

    const revealed = await reveal(
      jsonRequest(`${BASE}/${suresh.id}/reveal`, owner.cookie, {}),
      params(suresh.id),
    );
    expect(await json(revealed)).toEqual({
      aadhaar: "234123412346",
      pan: null,
    });

    const removed = await remove(
      jsonRequest(`${BASE}/${suresh.id}/remove`, owner.cookie, {}),
      params(suresh.id),
    );
    expect(removed.status).toBe(StatusCodes.NO_CONTENT);
    const gone = await getOne(
      jsonRequest(`${BASE}/${suresh.id}`, owner.cookie),
      params(suresh.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("lists with search, status and cursors", async () => {
    const owner = await ownerWithCompany();
    for (const name of ["Asha", "Bhavesh", "Chetan"])
      await create(
        jsonRequest(BASE, owner.cookie, {
          name,
          designationId: owner.designationId("Site Supervisor"),
          email: newEmail(),
          memberType: "normal",
        }),
      );
    const first = await json<Page>(
      await list(
        jsonRequest(`${BASE}?limit=2&status=joining_pending`, owner.cookie),
      ),
    );
    expect(first.items.map((item) => item.name)).toEqual(["Chetan", "Bhavesh"]);
    expect(first.total).toBe(3);
    expect(first.prevCursor).toBeNull();
    const second = await json<Page>(
      await list(
        jsonRequest(
          `${BASE}?limit=2&status=joining_pending&after=${first.nextCursor ?? ""}`,
          owner.cookie,
        ),
      ),
    );
    expect(second.items.map((item) => item.name)).toEqual(["Asha"]);
    expect(second.nextCursor).toBeNull();
    const back = await json<Page>(
      await list(
        jsonRequest(
          `${BASE}?limit=2&status=joining_pending&before=${second.prevCursor ?? ""}`,
          owner.cookie,
        ),
      ),
    );
    expect(back.items.map((item) => item.name)).toEqual(["Chetan", "Bhavesh"]);
    const searched = await json<Page>(
      await list(jsonRequest(`${BASE}?search=chet`, owner.cookie)),
    );
    expect(searched.items.map((item) => item.name)).toEqual(["Chetan"]);
    const bad = await list(jsonRequest(`${BASE}?after=nope`, owner.cookie));
    expect(bad.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(bad)).toMatchObject({ code: "INVALID_CURSOR" });
  });

  it("follows the Permission Matrix for Members", async () => {
    const owner = await ownerWithCompany();
    const viewer = await memberWith(owner, {
      "organization.team_members": ["read"],
    });
    const listed = await list(jsonRequest(BASE, viewer.cookie));
    expect(listed.status).toBe(StatusCodes.OK);
    const refused = await create(
      jsonRequest(BASE, viewer.cookie, {
        name: "X",
        designationId: owner.designationId("Admin"),
        email: newEmail(),
        memberType: "normal",
      }),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(refused)).toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("lets a Member grant only what they hold, never to themselves", async () => {
    const owner = await ownerWithCompany();
    const hr = await memberWith(owner, {
      "organization.team_members": ["create", "read", "update"],
      "labour.attendance": ["create", "read"],
    });
    const body = (permissions: unknown) => ({
      name: "New",
      designationId: owner.designationId("Site Supervisor"),
      email: newEmail(),
      memberType: "normal",
      permissions,
    });
    const subset = await create(
      jsonRequest(BASE, hr.cookie, body({ "labour.attendance": ["read"] })),
    );
    expect(subset.status).toBe(StatusCodes.CREATED);
    const superset = await create(
      jsonRequest(BASE, hr.cookie, body({ "labour.attendance": ["delete"] })),
    );
    expect(superset.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(superset)).toMatchObject({
      code: "CANNOT_GRANT_MORE_THAN_YOU_HAVE",
    });
    const self = await setPermissions(
      jsonRequest(`${BASE}/${hr.memberId}/permissions`, hr.cookie, {
        permissions: { "labour.attendance": ["read"] },
      }),
      params(hr.memberId),
    );
    expect(await json(self)).toMatchObject({
      code: "CANNOT_CHANGE_OWN_PERMISSIONS",
    });
    const revealRefused = await reveal(
      jsonRequest(`${BASE}/${hr.memberId}/reveal`, hr.cookie, {}),
      params(hr.memberId),
    );
    expect(revealRefused.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("ends a removed Member's access", async () => {
    const owner = await ownerWithCompany();
    const member = await memberWith(owner, {
      "organization.team_members": ["read"],
    });
    await remove(
      jsonRequest(`${BASE}/${member.memberId}/remove`, owner.cookie, {}),
      params(member.memberId),
    );
    await expect(companies.listForUser(member.userId)).resolves.toEqual([]);
    const after = await list(jsonRequest(BASE, member.cookie));
    expect(after.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(after)).toMatchObject({ code: "NO_ACTIVE_COMPANY" });
  });

  it("never shows another Company's Team Member, and validates menus", async () => {
    const owner = await ownerWithCompany();
    const other = await ownerWithCompany("Shree Infra");
    const theirs = await json<Member>(
      await create(
        jsonRequest(BASE, other.cookie, {
          name: "Theirs",
          designationId: other.designationId("Admin"),
          email: newEmail(),
          memberType: "normal",
        }),
      ),
    );
    const response = await getOne(
      jsonRequest(`${BASE}/${theirs.id}`, owner.cookie),
      params(theirs.id),
    );
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    const unknown = await create(
      jsonRequest(BASE, owner.cookie, {
        name: "X",
        designationId: owner.designationId("Admin"),
        email: newEmail(),
        memberType: "normal",
        permissions: { "nope.menu": ["read"] },
      }),
    );
    expect(unknown.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("lets a joined Member's mobile change while SMS is off", async () => {
    const owner = await ownerWithCompany();
    const member = await memberWith(owner, {});
    const shown = await json<Member>(
      await getOne(
        jsonRequest(`${BASE}/${member.memberId}`, owner.cookie),
        params(member.memberId),
      ),
    );
    expect(shown).toMatchObject({ status: "active", mobileLocked: false });
    const mobile = newMobile();
    const changed = await update(
      jsonRequest(`${BASE}/${member.memberId}/update`, owner.cookie, {
        name: "Member",
        designationId: owner.designationId("Site Engineer"),
        email: member.email,
        mobile,
        memberType: "normal",
      }),
      params(member.memberId),
    );
    expect(changed.status).toBe(StatusCodes.OK);
    expect(await json<Member>(changed)).toMatchObject({
      mobile,
      mobileLocked: false,
    });
  });

  it("will not invite again a Team Member without an email while SMS is off", async () => {
    const owner = await ownerWithCompany();
    const created = await json<Member>(
      await create(
        jsonRequest(BASE, owner.cookie, {
          name: "Mobile Only",
          designationId: owner.designationId("Site Supervisor"),
          mobile: newMobile(),
          memberType: "normal",
        }),
      ),
    );
    expect(created).toMatchObject({ status: "joining_pending", email: null });
    const refused = await resend(
      jsonRequest(`${BASE}/${created.id}/resend-invite`, owner.cookie, {}),
      params(created.id),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await json(refused)).toMatchObject({
      code: "MEMBER_EMAIL_REQUIRED",
    });
  });

  it("is on /api/docs", async () => {
    const spec = await json<{ paths: Record<string, unknown> }>(getOpenApi());
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining([
        "/api/construction/organization/team-members",
        "/api/construction/organization/team-members/{id}/permissions",
        "/api/construction/organization/team-members/{id}/remove",
      ]),
    );
  });
});

describe("Team Members HTTP, SMS on (ADR CM-0009)", () => {
  const sms = withSms();
  beforeAll(sms.on);
  afterAll(sms.off);

  it("locks a joined Member's mobile, which is their sign-in", async () => {
    const owner = await ownerWithCompany();
    const member = await memberWith(owner, {});
    const shown = await json<Member>(
      await getOne(
        jsonRequest(`${BASE}/${member.memberId}`, owner.cookie),
        params(member.memberId),
      ),
    );
    expect(shown.mobileLocked).toBe(true);
    const refused = await update(
      jsonRequest(`${BASE}/${member.memberId}/update`, owner.cookie, {
        name: "Member",
        designationId: owner.designationId("Site Engineer"),
        email: member.email,
        mobile: newMobile(),
        memberType: "normal",
      }),
      params(member.memberId),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await json(refused)).toMatchObject({ code: "MOBILE_LOCKED" });
  });

  it("invites again a Team Member with only a mobile", async () => {
    const owner = await ownerWithCompany();
    const created = await json<Member>(
      await create(
        jsonRequest(BASE, owner.cookie, {
          name: "Mobile Only",
          designationId: owner.designationId("Site Supervisor"),
          mobile: newMobile(),
          memberType: "normal",
        }),
      ),
    );
    const resent = await resend(
      jsonRequest(`${BASE}/${created.id}/resend-invite`, owner.cookie, {}),
      params(created.id),
    );
    expect(resent.status).toBe(StatusCodes.OK);
  });
});
