import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import type { PermissionGrants } from "@/src/shared-kernel/access";
import { addDays, calendarDateToDb } from "@/src/shared-kernel/calendar-date";
import { companyToday } from "@/src/shared-kernel/company-today";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as reassign } from "../companies/[id]/reassign/route";
import { GET as needsReassigning } from "../companies/needs-reassigning/route";
import { POST as createCompany } from "../companies/route";
import {
  GET as listFollowUps,
  POST as createFollowUp,
} from "../follow-ups/route";
import { POST as createVisit } from "../visits/route";
import { POST as setTarget } from "./[memberId]/target/route";
import { GET as getTeam } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/marketing`;

type Session = { cookie: string };

type Team = {
  month: string;
  people: {
    memberId: string;
    active: boolean;
    visitsThisMonth: number;
    target: number | null;
    followUpsOverdue: number;
    lastVisitAt: string | null;
  }[];
  canSetTargets: boolean;
  addPersonRoleId: string | null;
  canAddPerson: boolean;
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const MARKETING: PermissionGrants = {
  "marketing.visits": ["create", "read", "update"],
  "marketing.follow_ups": ["create", "read", "update"],
  "marketing.companies": ["create", "read", "update"],
};

async function aCompany(who: Session) {
  return json<{ id: string; updatedAt: string; contacts: { id: string }[] }>(
    await createCompany(
      jsonRequest(`${BASE}/companies`, who.cookie, {
        name: `Kaveri Steel ${randomUUID().slice(0, 6)}`,
        primaryContact: { name: "Lakshmi" },
      }),
    ),
  );
}

async function team(who: Session): Promise<Team> {
  const response = await getTeam(jsonRequest(`${BASE}/team`, who.cookie));
  expect(response.status).toBe(StatusCodes.OK);
  return json<Team>(response);
}

const rowOf = (found: Team, memberId: string) =>
  found.people.find((row) => row.memberId === memberId);

const memberParams = (memberId: string) => ({
  params: Promise.resolve({ memberId }),
});
const companyParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe("Marketing Team (ADR CM-0040 §4)", () => {
  it("lists each Marketing Person with this month's Visits, target, Follow-ups overdue and last Visit", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const clerk = await memberWith(owner, { "marketing.companies": ["read"] });
    const today = await companyToday(prisma, owner.workspaceId);
    const company = await aCompany(ravi);
    await createVisit(
      jsonRequest(`${BASE}/visits`, ravi.cookie, {
        status: "completed",
        prospectCompanyId: company.id,
        visitAt: new Date(Date.now() - 60_000).toISOString(),
        contactIds: company.contacts.map((contact) => contact.id),
        discussion: "Shed rates.",
      }),
    );
    await createFollowUp(
      jsonRequest(`${BASE}/follow-ups`, ravi.cookie, {
        prospectCompanyId: company.id,
        type: "call",
        dueDate: addDays(today, -1),
      }),
    );

    const found = await team(owner);
    const ids = found.people.map((row) => row.memberId);
    // Ravi, not someone whose Role cannot add Visits.
    expect(ids).toContain(ravi.memberId);
    expect(ids).not.toContain(clerk.memberId);
    expect(rowOf(found, ravi.memberId)).toMatchObject({
      active: true,
      target: null,
      followUpsOverdue: 1,
    });
    expect(rowOf(found, ravi.memberId)?.lastVisitAt).not.toBeNull();
    // A minute ago is this month, except in the first minute of one.
    expect(rowOf(found, ravi.memberId)?.visitsThisMonth).toBeLessThanOrEqual(1);
    expect(found).toMatchObject({
      month: today.slice(0, 7),
      canSetTargets: true,
      canAddPerson: true,
    });
    const marketingRole =
      await prisma.constructionOrganizationRole.findFirstOrThrow({
        where: {
          workspaceId: owner.workspaceId,
          name: "Marketing",
          isSeed: true,
        },
      });
    expect(found.addPersonRoleId).toBe(marketingRole.id);
  });

  it("sets a target from this month, leaving earlier months theirs, with Team update only", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const viewer = await memberWith(owner, { "marketing.team": ["read"] });
    const today = await companyToday(prisma, owner.workspaceId);
    const month = today.slice(0, 7);

    const refused = await setTarget(
      jsonRequest(`${BASE}/team/${ravi.memberId}/target`, viewer.cookie, {
        target: 10,
      }),
      memberParams(ravi.memberId),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect((await team(viewer)).canSetTargets).toBe(false);

    // A target set some months ago still holds until it is changed.
    const earlier = addDays(`${month}-01`, -40).slice(0, 7);
    await prisma.constructionMarketingVisitTarget.create({
      data: {
        id: randomUUID(),
        workspaceId: owner.workspaceId,
        memberId: ravi.memberId,
        effectiveMonth: calendarDateToDb(`${earlier}-01`),
        target: 12,
        createdBy: owner.userId,
        updatedBy: owner.userId,
      },
    });
    expect(rowOf(await team(owner), ravi.memberId)?.target).toBe(12);

    const set = await setTarget(
      jsonRequest(`${BASE}/team/${ravi.memberId}/target`, owner.cookie, {
        target: 20,
      }),
      memberParams(ravi.memberId),
    );
    expect(set.status).toBe(StatusCodes.OK);
    expect(rowOf(await json<Team>(set), ravi.memberId)?.target).toBe(20);
    const rows = await prisma.constructionMarketingVisitTarget.findMany({
      where: { workspaceId: owner.workspaceId, memberId: ravi.memberId },
      orderBy: { effectiveMonth: "asc" },
    });
    expect(rows.map((row) => row.target)).toEqual([12, 20]);

    const bad = await setTarget(
      jsonRequest(`${BASE}/team/${ravi.memberId}/target`, owner.cookie, {
        target: 2.5,
      }),
      memberParams(ravi.memberId),
    );
    expect(bad.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("reassigns a company with its open Follow-ups, and lists what someone who left still holds", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const priya = await memberWith(owner, MARKETING);
    const today = await companyToday(prisma, owner.workspaceId);
    const company = await aCompany(ravi);
    const followUp = await json<{ id: string }>(
      await createFollowUp(
        jsonRequest(`${BASE}/follow-ups`, ravi.cookie, {
          prospectCompanyId: company.id,
          type: "call",
          dueDate: today,
        }),
      ),
    );

    // Ravi is removed: what he held needs reassigning.
    await prisma.constructionOrganizationTeamMember.update({
      where: { id: ravi.memberId },
      data: { deletedAt: new Date() },
    });
    const listed = await json<{
      companies: { id: string; assignedTo: { id: string } }[];
      followUps: { id: string }[];
    }>(
      await needsReassigning(
        jsonRequest(`${BASE}/companies/needs-reassigning`, owner.cookie),
      ),
    );
    expect(listed.companies.map((row) => [row.id, row.assignedTo.id])).toEqual([
      [company.id, ravi.memberId],
    ]);
    expect(listed.followUps.map((row) => row.id)).toEqual([followUp.id]);
    const withoutTransfer = await needsReassigning(
      jsonRequest(`${BASE}/companies/needs-reassigning`, priya.cookie),
    );
    expect(withoutTransfer.status).toBe(StatusCodes.FORBIDDEN);

    const moved = await reassign(
      jsonRequest(`${BASE}/companies/${company.id}/reassign`, owner.cookie, {
        assignedMemberId: priya.memberId,
        expectedUpdatedAt: company.updatedAt,
      }),
      companyParams(company.id),
    );
    expect(moved.status).toBe(StatusCodes.OK);
    expect(
      (await json<{ assignedTo: { id: string } }>(moved)).assignedTo.id,
    ).toBe(priya.memberId);
    // The open Follow-up went with it.
    const priyas = await json<{ items: { id: string }[] }>(
      await listFollowUps(
        jsonRequest(`${BASE}/follow-ups?mine=1`, priya.cookie),
      ),
    );
    expect(priyas.items.map((row) => row.id)).toEqual([followUp.id]);
    const after = await json<{ companies: unknown[]; followUps: unknown[] }>(
      await needsReassigning(
        jsonRequest(`${BASE}/companies/needs-reassigning`, owner.cookie),
      ),
    );
    expect(after).toEqual({ companies: [], followUps: [] });
  });

  it("reassigns only with Companies transfer, and only to an active Marketing Person", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const clerk = await memberWith(owner, { "marketing.companies": ["read"] });
    const company = await aCompany(ravi);
    const refused = await reassign(
      jsonRequest(`${BASE}/companies/${company.id}/reassign`, ravi.cookie, {
        assignedMemberId: ravi.memberId,
        expectedUpdatedAt: company.updatedAt,
      }),
      companyParams(company.id),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    const notAPerson = await reassign(
      jsonRequest(`${BASE}/companies/${company.id}/reassign`, owner.cookie, {
        assignedMemberId: clerk.memberId,
        expectedUpdatedAt: company.updatedAt,
      }),
      companyParams(company.id),
    );
    expect(await json(notAPerson)).toMatchObject({
      code: "MARKETING_PERSON_NOT_FOUND",
    });
  });
});
