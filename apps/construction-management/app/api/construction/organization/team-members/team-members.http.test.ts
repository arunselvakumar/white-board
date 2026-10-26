import { companies } from "@repo/auth/construction/server";
import { StatusCodes } from "http-status-codes";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { openRevealWindow, sessionIdOf } from "@/test/accounts";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
  roleWith,
} from "@/test/companies";
import { newEmail, newMobile, TEST_ORIGIN, withSms } from "@/test/sessions";

import { POST as assignProjects } from "./[id]/projects/route";
import { POST as remove } from "./[id]/remove/route";
import { POST as resend } from "./[id]/resend-invite/route";
import { POST as reveal } from "./[id]/reveal/route";
import { PUT as setRole } from "./[id]/role/route";
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
  role: { id: string; name: string } | null;
  permissions: Record<string, string[]>;
  canSetPassword: boolean;
  passwordIgnored?: string | null;
  aadhaarMasked: string | null;
  monthlySalary: number | null;
  invitePath: string | null;
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
        name: "Prabhu Saravanan",
        email: newEmail(),
        aadhaar: "2341 2341 2346",
        memberType: "normal",
        projectIds: [projectA],
        roleId: owner.roleId("Site Engineer"),
      }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const prabhu = await json<Member>(created);
    expect(prabhu).toMatchObject({
      status: "joining_pending",
      aadhaarMasked: "XXXXXXXX2346",
      role: { id: owner.roleId("Site Engineer"), name: "Site Engineer" },
      canSetPassword: true,
      passwordIgnored: null,
    });
    expect(prabhu.permissions["labour.attendance"]).toEqual([
      "create",
      "read",
      "update",
    ]);

    const moved = await setRole(
      jsonRequest(
        `${BASE}/${prabhu.id}/role`,
        owner.cookie,
        { roleId: owner.roleId("Store Keeper") },
        "PUT",
      ),
      params(prabhu.id),
    );
    expect(moved.status).toBe(StatusCodes.OK);
    const storeKeeper = await json<Member>(moved);
    expect(storeKeeper.role).toEqual({
      id: owner.roleId("Store Keeper"),
      name: "Store Keeper",
    });
    expect(storeKeeper.permissions["labour.attendance"]).toBeUndefined();

    const assigned = await json<Member>(
      await assignProjects(
        jsonRequest(`${BASE}/${prabhu.id}/projects`, owner.cookie, {
          projectIds: [projectB],
        }),
        params(prabhu.id),
      ),
    );
    expect(assigned.projectIds).toEqual([projectB]);

    const hrms = await json<Member>(
      await update(
        jsonRequest(`${BASE}/${prabhu.id}/update`, owner.cookie, {
          name: "Prabhu K.",
          email: (
            await json<{ email: string }>(
              await getOne(
                jsonRequest(`${BASE}/${prabhu.id}`, owner.cookie),
                params(prabhu.id),
              ),
            )
          ).email,
          memberType: "hrms",
        }),
        params(prabhu.id),
      ),
    );
    // Changing Member Type keeps the Role (ADR CM-0030).
    expect(hrms).toMatchObject({
      name: "Prabhu K.",
      memberType: "hrms",
      projectIds: [],
      role: { name: "Store Keeper" },
    });

    const resent = await json<Member>(
      await resend(
        jsonRequest(`${BASE}/${prabhu.id}/resend-invite`, owner.cookie, {}),
        params(prabhu.id),
      ),
    );
    expect(resent.invitePath).not.toBe(prabhu.invitePath);

    await openRevealWindow(owner.userId, await sessionIdOf(owner.cookie));
    const revealed = await reveal(
      jsonRequest(`${BASE}/${prabhu.id}/reveal`, owner.cookie, {}),
      params(prabhu.id),
    );
    expect(await json(revealed)).toEqual({
      aadhaar: "234123412346",
      pan: null,
    });

    const removed = await remove(
      jsonRequest(`${BASE}/${prabhu.id}/remove`, owner.cookie, {}),
      params(prabhu.id),
    );
    expect(removed.status).toBe(StatusCodes.NO_CONTENT);
    const gone = await getOne(
      jsonRequest(`${BASE}/${prabhu.id}`, owner.cookie),
      params(prabhu.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("lists with search, status and cursors", async () => {
    const owner = await ownerWithCompany();
    for (const name of ["Abirami", "Bhavesh", "Chetan"])
      await create(
        jsonRequest(BASE, owner.cookie, {
          name,
          email: newEmail(),
          memberType: "normal",
          roleId: owner.roleId("Site Supervisor"),
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
    expect(second.items.map((item) => item.name)).toEqual(["Abirami"]);
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
        email: newEmail(),
        memberType: "normal",
        roleId: owner.roleId("Accountant"),
      }),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(refused)).toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("keeps the salary behind Financial on Staff (ADR CM-0032)", async () => {
    const owner = await ownerWithCompany();
    const body = (overrides: Record<string, unknown> = {}) => ({
      name: "Prabhu Saravanan",
      mobile: newMobile(),
      memberType: "normal",
      roleId: owner.roleId("Accountant"),
      invite: false,
      ...overrides,
    });
    const created = await create(
      jsonRequest(BASE, owner.cookie, body({ monthlySalary: 2_500_000 })),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const prabhu = await json<Member>(created);
    expect(prabhu.monthlySalary).toBe(2_500_000);
    const ownerSees = async (id: string) =>
      (
        await json<Member>(
          await getOne(jsonRequest(`${BASE}/${id}`, owner.cookie), params(id)),
        )
      ).monthlySalary;

    // A clerk without Financial sees none, and cannot set or change one.
    const clerk = await memberWith(owner, {
      "organization.team_members": ["create", "read", "update"],
    });
    const clerkRole = await roleWith(owner.workspaceId, owner.userId, {
      "organization.team_members": ["read"],
    });
    const seen = await json<Member>(
      await getOne(
        jsonRequest(`${BASE}/${prabhu.id}`, clerk.cookie),
        params(prabhu.id),
      ),
    );
    expect(seen.monthlySalary).toBeNull();
    const edited = await update(
      jsonRequest(`${BASE}/${prabhu.id}/update`, clerk.cookie, {
        ...body({ mobile: seen.mobile }),
        name: "Prabhu K.",
        monthlySalary: 100,
      }),
      params(prabhu.id),
    );
    expect(edited.status).toBe(StatusCodes.OK);
    expect(await ownerSees(prabhu.id)).toBe(2_500_000);
    const byClerk = await json<Member>(
      await create(
        jsonRequest(
          BASE,
          clerk.cookie,
          body({ roleId: clerkRole, monthlySalary: 100 }),
        ),
      ),
    );
    expect(await ownerSees(byClerk.id)).toBeNull();

    // With Financial: null clears it, leaving it out keeps it.
    const accountant = await memberWith(owner, {
      "organization.team_members": ["read", "update", "financial"],
    });
    const kept = await update(
      jsonRequest(`${BASE}/${prabhu.id}/update`, accountant.cookie, {
        ...body({ mobile: seen.mobile }),
        name: "Prabhu S.",
      }),
      params(prabhu.id),
    );
    expect((await json<Member>(kept)).monthlySalary).toBe(2_500_000);
    const cleared = await update(
      jsonRequest(`${BASE}/${prabhu.id}/update`, accountant.cookie, {
        ...body({ mobile: seen.mobile }),
        monthlySalary: null,
      }),
      params(prabhu.id),
    );
    expect((await json<Member>(cleared)).monthlySalary).toBeNull();

    for (const monthlySalary of [-1, 2_000_000_001, 12.5]) {
      const refused = await create(
        jsonRequest(BASE, owner.cookie, body({ monthlySalary })),
      );
      expect(refused.status).toBe(StatusCodes.BAD_REQUEST);
    }
  });

  it("lets a Member give only a Role they hold every cell of, never to themselves", async () => {
    const owner = await ownerWithCompany();
    const hr = await memberWith(owner, {
      "organization.team_members": ["create", "read", "update"],
      "labour.attendance": ["create", "read"],
    });
    const body = (roleId: string) => ({
      name: "New",
      email: newEmail(),
      memberType: "normal",
      roleId,
    });
    const subset = await create(
      jsonRequest(
        BASE,
        hr.cookie,
        body(
          await roleWith(owner.workspaceId, owner.userId, {
            "labour.attendance": ["read"],
          }),
        ),
      ),
    );
    expect(subset.status).toBe(StatusCodes.CREATED);
    const superset = await create(
      jsonRequest(BASE, hr.cookie, body(owner.roleId("Site Engineer"))),
    );
    expect(superset.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(superset)).toMatchObject({ code: "CANNOT_GRANT" });
    const created = await json<Member>(subset);
    const widened = await setRole(
      jsonRequest(
        `${BASE}/${created.id}/role`,
        hr.cookie,
        { roleId: owner.roleId("Admin") },
        "PUT",
      ),
      params(created.id),
    );
    expect(await json(widened)).toMatchObject({ code: "CANNOT_GRANT" });
    const self = await setRole(
      jsonRequest(
        `${BASE}/${hr.memberId}/role`,
        hr.cookie,
        { roleId: owner.roleId("Admin") },
        "PUT",
      ),
      params(hr.memberId),
    );
    expect(self.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(self)).toMatchObject({ code: "OWN_ROLE" });
    const revealRefused = await reveal(
      jsonRequest(`${BASE}/${hr.memberId}/reveal`, hr.cookie, {}),
      params(hr.memberId),
    );
    expect(revealRefused.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("gives the Owner no Role", async () => {
    const owner = await ownerWithCompany();
    const page = await json<Page>(await list(jsonRequest(BASE, owner.cookie)));
    const self = page.items[0];
    expect(self).toMatchObject({ role: null, canSetPassword: false });
    const refused = await setRole(
      jsonRequest(
        `${BASE}/${self?.id ?? ""}/role`,
        owner.cookie,
        { roleId: owner.roleId("Admin") },
        "PUT",
      ),
      params(self?.id ?? ""),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await json(refused)).toMatchObject({ code: "OWNER_HAS_NO_ROLE" });
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

  it("never shows another Company's Team Member or Role", async () => {
    const owner = await ownerWithCompany();
    const other = await ownerWithCompany("Sri Infra");
    const theirs = await json<Member>(
      await create(
        jsonRequest(BASE, other.cookie, {
          name: "Theirs",
          email: newEmail(),
          memberType: "normal",
          roleId: other.roleId("Accountant"),
        }),
      ),
    );
    const response = await getOne(
      jsonRequest(`${BASE}/${theirs.id}`, owner.cookie),
      params(theirs.id),
    );
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    const theirRole = await create(
      jsonRequest(BASE, owner.cookie, {
        name: "X",
        email: newEmail(),
        memberType: "normal",
        roleId: other.roleId("Accountant"),
      }),
    );
    expect(theirRole.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(theirRole)).toMatchObject({ code: "ROLE_NOT_FOUND" });
    const noRole = await create(
      jsonRequest(BASE, owner.cookie, {
        name: "X",
        email: newEmail(),
        memberType: "normal",
      }),
    );
    expect(noRole.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(noRole)).toMatchObject({ code: "VALIDATION_ERROR" });
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

  it("will not invite a Team Member without an email while SMS is off", async () => {
    const owner = await ownerWithCompany();
    const body = {
      name: "Mobile Only",
      mobile: newMobile(),
      memberType: "normal",
      roleId: owner.roleId("Site Supervisor"),
    };
    const invited = await create(jsonRequest(BASE, owner.cookie, body));
    expect(invited.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(invited)).toMatchObject({
      code: "MEMBER_EMAIL_REQUIRED",
    });
    const created = await json<Member>(
      await create(jsonRequest(BASE, owner.cookie, { ...body, invite: false })),
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
        "/api/construction/organization/team-members/{id}/role",
        "/api/construction/organization/team-members/{id}/password",
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
          mobile: newMobile(),
          memberType: "normal",
          roleId: owner.roleId("Site Supervisor"),
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
