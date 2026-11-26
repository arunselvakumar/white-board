import { outbox } from "@repo/auth/construction/testing";
import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as listOfficeStaff } from "@/app/api/construction/organization/team-members/route";
import { POST as createSupervisor } from "@/app/api/construction/masters/supervisors/route";
import { createTeamMemberHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { TEST_ORIGIN, newEmail, newMobile, postAuth } from "@/test/sessions";

import { POST as remove } from "./[id]/delete/route";
import { POST as setPassword } from "./[id]/password/route";
import { GET as getOne } from "./[id]/route";
import { POST as update } from "./[id]/update/route";
import { GET as list, POST as create } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/masters/site-engineers`;
const FIRST_PASSWORD = "first-pass-1234";

type SiteEngineer = {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  aadhaarMasked: string | null;
  profile: Record<string, unknown>;
  bank: Record<string, unknown> | null;
  signIn: { kind: string; memberId?: string; status?: string };
  salaryPerMonth: number | null;
  projectIds: string[];
  updatedAt: string;
  passwordIgnored?: string | null;
  passwordSet?: boolean;
};

type Owner = Awaited<ReturnType<typeof ownerWithCompany>>;

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

const PROFILE = {
  employeeCode: "SE-001",
  fatherName: "Selvam",
  dateOfBirth: "1990-04-12",
  gender: "male",
  bloodGroup: "B+",
  joiningDate: "2024-06-01",
  qualification: "B.E. Civil",
  experienceYears: 8,
  specialisation: "Steel / PEB",
};

function add(owner: { cookie: string }, fields: Record<string, unknown> = {}) {
  return create(
    jsonRequest(BASE, owner.cookie, {
      name: "Karthik Raja",
      mobile: newMobile(),
      email: newEmail(),
      address: "12 Anna Nagar, Madurai",
      aadhaar: "2345 6789 0124",
      emergencyContact: "Priya, +91 98400 12345",
      salaryType: "monthly",
      salaryPerMonth: 4_500_000,
      profile: PROFILE,
      bank: {
        accountHolder: "Karthik Raja",
        accountNumber: "50100123456789",
        ifsc: "hdfc0001234",
        bankName: "HDFC Bank",
      },
      signIn: { password: FIRST_PASSWORD },
      ...fields,
    }),
  );
}

async function teamMemberCount(owner: Owner): Promise<number> {
  return prisma.constructionOrganizationTeamMember.count({
    where: { workspaceId: owner.workspaceId, deletedAt: null },
  });
}

describe("Site Engineers HTTP (ADR CM-0037, CM-0053)", () => {
  it("adds a Site Engineer who signs in on the Site Engineer Role, off Office Staff", async () => {
    const owner = await ownerWithCompany();
    const projectId = await addProject(owner.workspaceId, owner.userId);
    const mobile = newMobile();
    const email = newEmail();
    outbox.length = 0;
    const created = await add(owner, {
      mobile,
      email,
      projectIds: [projectId],
    });
    expect(created.status).toBe(StatusCodes.CREATED);
    const engineer = await json<SiteEngineer>(created);
    expect(engineer).toMatchObject({
      name: "Karthik Raja",
      mobile,
      aadhaarMasked: "XXXXXXXX0124",
      profile: { ...PROFILE, bloodGroup: "B+" },
      bank: {
        accountHolder: "Karthik Raja",
        accountLast4: "6789",
        ifsc: "HDFC0001234",
        bankName: "HDFC Bank",
      },
      signIn: { kind: "site_engineer", status: "active" },
      salaryPerMonth: 4_500_000,
      projectIds: [projectId],
      passwordIgnored: null,
      passwordSet: true,
    });

    const member =
      await prisma.constructionOrganizationTeamMember.findUniqueOrThrow({
        where: { id: engineer.signIn.memberId ?? "" },
        include: { role: true },
      });
    expect(member).toMatchObject({
      siteEngineer: true,
      roleId: owner.roleId("Site Engineer"),
    });

    // They sign in with their mobile and the first password (ADR CM-0053).
    const signedIn = await postAuth("/sign-in/phone-number", {
      phoneNumber: mobile,
      password: FIRST_PASSWORD,
    });
    expect(signedIn.status).toBe(StatusCodes.OK);
    // The email is a contact only: not their login, and nothing is mailed.
    const byEmail = await postAuth("/sign-in/email", {
      email,
      password: FIRST_PASSWORD,
    });
    expect(byEmail.status).not.toBe(StatusCodes.OK);
    expect(outbox.filter((mail) => mail.to === email)).toEqual([]);
    expect(engineer).toMatchObject({ email });

    // Listed as a Site Engineer, not on Office Staff.
    const engineers = await json<{ items: SiteEngineer[] }>(
      await list(jsonRequest(BASE, owner.cookie)),
    );
    expect(engineers.items.map((item) => item.name)).toEqual(["Karthik Raja"]);
    const staff = await json<{ items: { id: string }[] }>(
      await listOfficeStaff(
        jsonRequest(
          `${TEST_ORIGIN}/api/construction/organization/team-members`,
          owner.cookie,
        ),
      ),
    );
    expect(staff.items.map((item) => item.id)).not.toContain(member.id);

    // The bank account number is stored encrypted and never audited.
    const row = await prisma.constructionMastersSupervisor.findUniqueOrThrow({
      where: { id: engineer.id },
    });
    expect(row.bankAccountEncrypted).not.toContain("50100123456789");
    expect(row.bankAccountLast4).toBe("6789");
    const audits = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: owner.workspaceId, entityId: engineer.id },
    });
    expect(JSON.stringify(audits)).not.toContain("50100123456789");
  });

  it("needs a mobile and a password, and refuses before making a sign-in", async () => {
    const owner = await ownerWithCompany();
    const before = await teamMemberCount(owner);
    const none = await add(owner, { signIn: {} });
    expect(none.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(none)).toMatchObject({ code: "SIGN_IN_REQUIRED" });
    // An invitation is no longer a way in (ADR CM-0053).
    const invite = await add(owner, { signIn: { invite: true } });
    expect(await json(invite)).toMatchObject({ code: "SIGN_IN_REQUIRED" });
    const noMobile = await add(owner, { mobile: null });
    expect(noMobile.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(noMobile)).toMatchObject({ code: "MOBILE_REQUIRED" });
    expect(await teamMemberCount(owner)).toBe(before);

    expect((await add(owner)).status).toBe(StatusCodes.CREATED);
    const after = await teamMemberCount(owner);
    expect(after).toBe(before + 1);
    // The name is taken: refused before a second sign-in is made.
    const taken = await add(owner);
    expect(taken.status).toBe(StatusCodes.CONFLICT);
    expect(await json(taken)).toMatchObject({
      code: "SUPERVISOR_NAME_IN_USE",
    });
    const code = await add(owner, { name: "Velu Murugan" });
    expect(code.status).toBe(StatusCodes.CONFLICT);
    expect(await json(code)).toMatchObject({
      code: "SUPERVISOR_EMPLOYEE_CODE_IN_USE",
    });
    expect(await teamMemberCount(owner)).toBe(after);

    const badBlood = await add(owner, {
      name: "Velu Murugan",
      profile: { bloodGroup: "C+" },
    });
    expect(badBlood.status).toBe(StatusCodes.BAD_REQUEST);
    const badIfsc = await add(owner, {
      name: "Velu Murugan",
      profile: {},
      bank: { ifsc: "HDFC1234" },
    });
    expect(await json(badIfsc)).toMatchObject({ code: "IFSC_INVALID" });
    expect(await teamMemberCount(owner)).toBe(after);
  });

  it("gives a sign-in only to someone who holds the Site Engineer Role", async () => {
    const owner = await ownerWithCompany();
    const clerk = await memberWith(owner, {
      "masters.labours": ["create", "read"],
    });
    const before = await teamMemberCount(owner);
    const refused = await add(clerk);
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(refused)).toMatchObject({ code: "CANNOT_GRANT" });
    expect(await teamMemberCount(owner)).toBe(before);
  });

  it("shows salary and bank details only with Financial on Labours", async () => {
    const owner = await ownerWithCompany();
    const engineer = await json<SiteEngineer>(await add(owner));
    const reader = await memberWith(owner, { "masters.labours": ["read"] });
    const seen = await json<SiteEngineer>(
      await getOne(
        jsonRequest(`${BASE}/${engineer.id}`, reader.cookie),
        params(engineer.id),
      ),
    );
    expect(seen).toMatchObject({
      bank: null,
      salaryPerMonth: null,
      profile: { employeeCode: "SE-001" },
    });
  });

  it("edits the record and its sign-in, keeping what the screen only holds masked", async () => {
    const owner = await ownerWithCompany();
    const projectId = await addProject(owner.workspaceId, owner.userId);
    const engineer = await json<SiteEngineer>(await add(owner));
    const saved = await update(
      jsonRequest(`${BASE}/${engineer.id}/update`, owner.cookie, {
        name: "Karthik Raja S",
        mobile: engineer.mobile,
        email: engineer.email,
        address: "4 KK Nagar, Madurai",
        emergencyContact: null,
        projectIds: [projectId],
        profile: { ...PROFILE, specialisation: "Civil" },
        bank: { accountHolder: "Karthik Raja S", ifsc: "SBIN0000123" },
        expectedUpdatedAt: engineer.updatedAt,
      }),
      params(engineer.id),
    );
    expect(saved.status).toBe(StatusCodes.OK);
    const savedBody = await json<SiteEngineer>(saved);
    expect(savedBody).toMatchObject({
      name: "Karthik Raja S",
      address: "4 KK Nagar, Madurai",
      aadhaarMasked: "XXXXXXXX0124",
      projectIds: [projectId],
      profile: { specialisation: "Civil" },
      bank: { accountLast4: "6789", ifsc: "SBIN0000123" },
    });
    const member =
      await prisma.constructionOrganizationTeamMember.findUniqueOrThrow({
        where: { id: engineer.signIn.memberId ?? "" },
      });
    expect(member.name).toBe("Karthik Raja S");

    // Projects left out are kept: the form no longer sends them (Site
    // Engineers are put on a Project from the Project's Resources).
    const kept = await update(
      jsonRequest(`${BASE}/${engineer.id}/update`, owner.cookie, {
        name: "Karthik Raja S",
        mobile: engineer.mobile,
        profile: { ...PROFILE, specialisation: "Civil" },
        expectedUpdatedAt: savedBody.updatedAt,
      }),
      params(engineer.id),
    );
    expect(kept.status).toBe(StatusCodes.OK);
    expect(await json(kept)).toMatchObject({ projectIds: [projectId] });

    const stale = await update(
      jsonRequest(`${BASE}/${engineer.id}/update`, owner.cookie, {
        name: "Someone else",
        mobile: engineer.mobile,
        profile: {},
        expectedUpdatedAt: engineer.updatedAt,
      }),
      params(engineer.id),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json(stale)).toMatchObject({ code: "SUPERVISOR_CHANGED" });
  });

  it("gives an older Site Engineer a sign-in on Edit, and leaves an Office Staff link alone", async () => {
    const owner = await ownerWithCompany();
    const older = await json<{ id: string; updatedAt: string }>(
      await createSupervisor(
        jsonRequest(
          `${TEST_ORIGIN}/api/construction/masters/supervisors`,
          owner.cookie,
          { name: "Sundar" },
        ),
      ),
    );
    const shown = await json<SiteEngineer>(
      await getOne(
        jsonRequest(`${BASE}/${older.id}`, owner.cookie),
        params(older.id),
      ),
    );
    expect(shown.signIn).toEqual({ kind: "none" });

    const mobile = newMobile();
    const body = {
      name: "Sundar",
      email: newEmail(),
      profile: { joiningDate: "2023-01-09" },
      expectedUpdatedAt: older.updatedAt,
    };
    const without = await update(
      jsonRequest(`${BASE}/${older.id}/update`, owner.cookie, {
        ...body,
        mobile,
      }),
      params(older.id),
    );
    expect(await json(without)).toMatchObject({ code: "SIGN_IN_REQUIRED" });
    const noMobile = await update(
      jsonRequest(`${BASE}/${older.id}/update`, owner.cookie, {
        ...body,
        signIn: { password: FIRST_PASSWORD },
      }),
      params(older.id),
    );
    expect(await json(noMobile)).toMatchObject({ code: "MOBILE_REQUIRED" });
    const given = await update(
      jsonRequest(`${BASE}/${older.id}/update`, owner.cookie, {
        ...body,
        mobile,
        signIn: { password: FIRST_PASSWORD },
      }),
      params(older.id),
    );
    expect(given.status).toBe(StatusCodes.OK);
    expect(await json<SiteEngineer>(given)).toMatchObject({
      signIn: { kind: "site_engineer", status: "active" },
    });
    const signedIn = await postAuth("/sign-in/phone-number", {
      phoneNumber: mobile,
      password: FIRST_PASSWORD,
    });
    expect(signedIn.status).toBe(StatusCodes.OK);

    // One linked to an Office Staff member before ADR CM-0037.
    const staff = await memberWith(owner, {});
    const linked = await json<{ id: string }>(
      await createSupervisor(
        jsonRequest(
          `${TEST_ORIGIN}/api/construction/masters/supervisors`,
          owner.cookie,
          { name: "Member on site", teamMemberId: staff.memberId },
        ),
      ),
    );
    const linkedView = await json<SiteEngineer>(
      await getOne(
        jsonRequest(`${BASE}/${linked.id}`, owner.cookie),
        params(linked.id),
      ),
    );
    expect(linkedView.signIn).toMatchObject({
      kind: "office_staff",
      memberId: staff.memberId,
    });
    const noPassword = await setPassword(
      jsonRequest(`${BASE}/${linked.id}/password`, owner.cookie, {
        password: FIRST_PASSWORD,
      }),
      params(linked.id),
    );
    expect(await json(noPassword)).toMatchObject({
      code: "SITE_ENGINEER_NO_SIGN_IN",
    });
  });

  it("lets one invited by email before ADR CM-0053 in with a mobile and a password", async () => {
    const owner = await ownerWithCompany();
    const invited = await createTeamMemberHandlers().invite({
      workspaceId: owner.workspaceId,
      by: owner.userId,
      memberType: "normal",
      siteEngineer: true,
      roleId: owner.roleId("Site Engineer"),
      details: { name: "Ganesh", email: newEmail() },
      invite: true,
    });
    const row = await json<{ id: string; updatedAt: string }>(
      await createSupervisor(
        jsonRequest(
          `${TEST_ORIGIN}/api/construction/masters/supervisors`,
          owner.cookie,
          { name: "Ganesh", teamMemberId: invited.id },
        ),
      ),
    );
    const pending = await json<SiteEngineer>(
      await getOne(
        jsonRequest(`${BASE}/${row.id}`, owner.cookie),
        params(row.id),
      ),
    );
    expect(pending.signIn).toMatchObject({
      kind: "site_engineer",
      status: "joining_pending",
      canSetPassword: false,
    });
    const noMobile = await setPassword(
      jsonRequest(`${BASE}/${row.id}/password`, owner.cookie, {
        password: FIRST_PASSWORD,
      }),
      params(row.id),
    );
    expect(noMobile.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(noMobile)).toMatchObject({ code: "MOBILE_REQUIRED" });

    const mobile = newMobile();
    const saved = await update(
      jsonRequest(`${BASE}/${row.id}/update`, owner.cookie, {
        name: "Ganesh",
        mobile,
        email: pending.email,
        profile: {},
        expectedUpdatedAt: pending.updatedAt,
      }),
      params(row.id),
    );
    expect(saved.status).toBe(StatusCodes.OK);
    expect(await json(saved)).toMatchObject({
      signIn: { status: "joining_pending", canSetPassword: true },
    });
    const password = await setPassword(
      jsonRequest(`${BASE}/${row.id}/password`, owner.cookie, {
        password: FIRST_PASSWORD,
      }),
      params(row.id),
    );
    expect(await json(password)).toMatchObject({
      signIn: { status: "active" },
      passwordIgnored: null,
    });
    const signedIn = await postAuth("/sign-in/phone-number", {
      phoneNumber: mobile,
      password: FIRST_PASSWORD,
    });
    expect(signedIn.status).toBe(StatusCodes.OK);
  });

  it("moves their sign-in when the mobile is corrected", async () => {
    const owner = await ownerWithCompany();
    const engineer = await json<SiteEngineer>(await add(owner));
    const corrected = newMobile();
    const body = {
      name: engineer.name,
      email: engineer.email,
      profile: PROFILE,
      expectedUpdatedAt: engineer.updatedAt,
    };
    const cleared = await update(
      jsonRequest(`${BASE}/${engineer.id}/update`, owner.cookie, {
        ...body,
        mobile: null,
      }),
      params(engineer.id),
    );
    expect(await json(cleared)).toMatchObject({ code: "MOBILE_REQUIRED" });

    const saved = await update(
      jsonRequest(`${BASE}/${engineer.id}/update`, owner.cookie, {
        ...body,
        mobile: corrected,
      }),
      params(engineer.id),
    );
    expect(saved.status).toBe(StatusCodes.OK);
    const savedBody = await json<SiteEngineer>(saved);
    expect(savedBody).toMatchObject({ mobile: corrected, mobileLocked: false });
    const signIn = (phoneNumber: string | null) =>
      postAuth("/sign-in/phone-number", {
        phoneNumber,
        password: FIRST_PASSWORD,
      });
    expect((await signIn(corrected)).status).toBe(StatusCodes.OK);
    expect((await signIn(engineer.mobile)).status).not.toBe(StatusCodes.OK);

    // Someone in another Company already signs in with this number.
    const other = await ownerWithCompany();
    const theirs = await json<SiteEngineer>(await add(other));
    const taken = await update(
      jsonRequest(`${BASE}/${engineer.id}/update`, owner.cookie, {
        ...body,
        mobile: theirs.mobile,
        expectedUpdatedAt: savedBody.updatedAt,
      }),
      params(engineer.id),
    );
    expect(taken.status).toBe(StatusCodes.CONFLICT);
    expect(await json(taken)).toMatchObject({ code: "MOBILE_IN_USE" });
    expect((await signIn(corrected)).status).toBe(StatusCodes.OK);
  });

  it("deletes the Site Engineer and takes back their sign-in", async () => {
    const owner = await ownerWithCompany();
    const engineer = await json<SiteEngineer>(await add(owner));
    const member =
      await prisma.constructionOrganizationTeamMember.findUniqueOrThrow({
        where: { id: engineer.signIn.memberId ?? "" },
      });
    const deleted = await remove(
      jsonRequest(`${BASE}/${engineer.id}/delete`, owner.cookie, {}),
      params(engineer.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    const after =
      await prisma.constructionOrganizationTeamMember.findUniqueOrThrow({
        where: { id: member.id },
      });
    expect(after.deletedAt).not.toBeNull();
    expect(
      await prisma.identityWorkspaceMember.count({
        where: {
          organizationId: owner.workspaceId,
          userId: member.userId ?? "",
        },
      }),
    ).toBe(0);
  });
});
