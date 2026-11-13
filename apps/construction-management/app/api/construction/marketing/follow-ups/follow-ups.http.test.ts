import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { createFollowUpRemindersHandler } from "@/src/composition/marketing-follow-up-reminders";
import { FOLLOW_UP_REMINDERS_JOB } from "@/src/marketing/application/follow-up-reminders";
import { prismaFollowUpStore } from "@/src/marketing/infrastructure/prisma-follow-up-store";
import type { PermissionGrants } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { companyToday } from "@/src/shared-kernel/company-today";
import { newId } from "@/src/shared-kernel/ids";
import type { QueueJob } from "@/src/shared-kernel/queue";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as removeCompany } from "../companies/[id]/delete/route";
import { GET as getCompany } from "../companies/[id]/route";
import {
  GET as listCompanies,
  POST as createCompany,
} from "../companies/route";
import { POST as createVisit } from "../visits/route";
import { POST as cancel } from "./[id]/cancel/route";
import { POST as remove } from "./[id]/delete/route";
import { POST as done } from "./[id]/done/route";
import { GET as getOne } from "./[id]/route";
import { POST as update } from "./[id]/update/route";
import { GET as formOptions } from "./form-options/route";
import { GET as list, POST as create } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/marketing/follow-ups`;
const COMPANIES = `${TEST_ORIGIN}/api/construction/marketing/companies`;
const VISITS = `${TEST_ORIGIN}/api/construction/marketing/visits`;

type Session = { cookie: string };

type FollowUp = {
  id: string;
  dueDate: string;
  due: string | null;
  status: string;
  owner: { id: string };
  visit: { id: string; number: string } | null;
  updatedAt: string;
  actions: Record<string, boolean>;
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const MARKETING: PermissionGrants = {
  "marketing.visits": ["create", "read", "update"],
  "marketing.follow_ups": ["create", "read", "update", "notification"],
  "marketing.companies": ["create", "read", "update"],
};

async function aCompany(who: Session): Promise<string> {
  const response = await createCompany(
    jsonRequest(COMPANIES, who.cookie, {
      name: `Kaveri Steel ${randomUUID().slice(0, 6)}`,
      primaryContact: { name: "Lakshmi" },
    }),
  );
  return (await json<{ id: string }>(response)).id;
}

async function add(
  who: Session,
  body: Record<string, unknown>,
  status = StatusCodes.CREATED,
): Promise<FollowUp> {
  const response = await create(
    jsonRequest(BASE, who.cookie, { type: "call", ...body }),
  );
  expect(response.status).toBe(status);
  return json<FollowUp>(response);
}

async function ids(who: Session, query = ""): Promise<string[]> {
  const response = await list(jsonRequest(`${BASE}${query}`, who.cookie));
  expect(response.status).toBe(StatusCodes.OK);
  return (await json<{ items: { id: string }[] }>(response)).items.map(
    (item) => item.id,
  );
}

async function runReminders(): Promise<void> {
  const job: QueueJob = {
    id: newId(),
    type: FOLLOW_UP_REMINDERS_JOB,
    workspaceId: null,
    payload: null,
    attempts: 1,
    maxAttempts: 3,
  };
  await createFollowUpRemindersHandler().run(job, new AbortController().signal);
}

/** Every id the reminder query reads now, page by page. */
async function readByReminders(): Promise<Set<string>> {
  const date = todayIn("Pacific/Kiritimati", new Date());
  const read = new Set<string>();
  let after: string | undefined;
  for (;;) {
    const page = await prismaFollowUpStore.openDueBy(date, {
      after,
      limit: 1_000,
    });
    for (const row of page) read.add(row.id);
    if (page.length < 1_000) return read;
    after = page.at(-1)?.id;
  }
}

async function notices(workspaceId: string) {
  return prisma.constructionMessagingNotification.findMany({
    where: { workspaceId, type: { startsWith: "marketing.follow_up" } },
    orderBy: { type: "asc" },
  });
}

describe("Follow-ups (ADR CM-0040 §5, §8)", () => {
  it("adds one owned by its creator and groups open ones Overdue, Today and Upcoming", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const companyId = await aCompany(ravi);
    const today = await companyToday(prisma, owner.workspaceId);

    const late = await add(ravi, {
      prospectCompanyId: companyId,
      dueDate: addDays(today, -2),
    });
    const now = await add(ravi, {
      prospectCompanyId: companyId,
      dueDate: today,
    });
    const later = await add(ravi, {
      prospectCompanyId: companyId,
      dueDate: addDays(today, 3),
      type: "send_quotation",
    });
    expect(late).toMatchObject({
      owner: { id: ravi.memberId },
      due: "overdue",
      status: "open",
    });
    expect([now.due, later.due]).toEqual(["today", "upcoming"]);
    expect(await ids(ravi, "?mine=1&status=open")).toEqual([
      late.id,
      now.id,
      later.id,
    ]);

    // The company shows its next one and lists them in its History.
    const companies = await json<{
      items: { id: string; nextFollowUpOn: string | null }[];
    }>(await listCompanies(jsonRequest(COMPANIES, ravi.cookie)));
    expect(
      companies.items.find((item) => item.id === companyId)?.nextFollowUpOn,
    ).toBe(addDays(today, -2));
    const company = await json<{ timeline: { kind: string }[] }>(
      await getCompany(
        jsonRequest(`${COMPANIES}/${companyId}`, ravi.cookie),
        params(companyId),
      ),
    );
    expect(
      company.timeline.filter((item) => item.kind === "follow_up"),
    ).toHaveLength(3);
  });

  it("lets a member give one to a colleague: both see it, no one else does", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const priya = await memberWith(owner, MARKETING);
    const anil = await memberWith(owner, MARKETING);
    const companyId = await aCompany(ravi);
    const today = await companyToday(prisma, owner.workspaceId);
    const given = await add(ravi, {
      prospectCompanyId: companyId,
      dueDate: today,
      ownerMemberId: priya.memberId,
    });

    expect(await ids(ravi)).toEqual([given.id]);
    expect(await ids(ravi, "?mine=1")).toEqual([]);
    expect(await ids(priya, "?mine=1")).toEqual([given.id]);
    expect(await ids(anil)).toEqual([]);
    const hidden = await getOne(
      jsonRequest(`${BASE}/${given.id}`, anil.cookie),
      params(given.id),
    );
    expect(hidden.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json(hidden)).toMatchObject({ code: "FOLLOW_UP_NOT_FOUND" });

    const notAPerson = await memberWith(owner, {
      "marketing.follow_ups": ["read"],
    });
    const refused = await create(
      jsonRequest(BASE, ravi.cookie, {
        type: "call",
        prospectCompanyId: companyId,
        dueDate: today,
        ownerMemberId: notAPerson.memberId,
      }),
    );
    expect(await json(refused)).toMatchObject({
      code: "MARKETING_PERSON_NOT_FOUND",
      details: { field: "ownerMemberId" },
    });
  });

  it("marks one Done with its result, never on a day to come, and then it is final", async () => {
    const owner = await ownerWithCompany();
    const companyId = await aCompany(owner);
    const today = await companyToday(prisma, owner.workspaceId);
    let followUp = await add(owner, {
      prospectCompanyId: companyId,
      dueDate: today,
    });
    const mark = (body: Record<string, unknown>) =>
      done(
        jsonRequest(`${BASE}/${followUp.id}/done`, owner.cookie, {
          expectedUpdatedAt: followUp.updatedAt,
          ...body,
        }),
        params(followUp.id),
      );

    const ahead = await mark({ doneOn: addDays(today, 1) });
    expect(await json(ahead)).toMatchObject({
      code: "FOLLOW_UP_DONE_IN_FUTURE",
    });
    followUp = await json<FollowUp>(
      await mark({ resultNote: "Sent the PEB rates" }),
    );
    expect(followUp).toMatchObject({
      status: "done",
      due: null,
      actions: { canUpdate: false, canClose: false },
    });
    const again = await cancel(
      jsonRequest(`${BASE}/${followUp.id}/cancel`, owner.cookie, {
        expectedUpdatedAt: followUp.updatedAt,
      }),
      params(followUp.id),
    );
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect(await json(again)).toMatchObject({ code: "FOLLOW_UP_NOT_OPEN" });
    expect(await ids(owner, "?status=done")).toEqual([followUp.id]);
    expect(await ids(owner, "?status=open")).toEqual([]);
  });

  it("is made by a Visit's Next Follow-up in the same save", async () => {
    const owner = await ownerWithCompany();
    const companyId = await aCompany(owner);
    const today = await companyToday(prisma, owner.workspaceId);
    const company = await json<{ contacts: { id: string }[] }>(
      await getCompany(
        jsonRequest(`${COMPANIES}/${companyId}`, owner.cookie),
        params(companyId),
      ),
    );
    const visit = await json<{ id: string; number: string }>(
      await createVisit(
        jsonRequest(VISITS, owner.cookie, {
          status: "completed",
          prospectCompanyId: companyId,
          visitAt: new Date(Date.now() - 3_600_000).toISOString(),
          contactIds: company.contacts.map((contact) => contact.id),
          discussion: "Wants rates for a 40 m shed.",
          nextFollowUp: {
            type: "send_quotation",
            dueDate: addDays(today, 2),
            note: "Rates for 40 m",
          },
        }),
      ),
    );
    const found = await json<{ items: FollowUp[] }>(
      await list(jsonRequest(`${BASE}?visitId=${visit.id}`, owner.cookie)),
    );
    expect(found.items).toHaveLength(1);
    expect(found.items[0]).toMatchObject({
      dueDate: addDays(today, 2),
      visit: { id: visit.id, number: visit.number },
    });
  });

  it("tells the owner once on the due day and once when overdue, and a new date starts again", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const quiet = await memberWith(owner, {
      ...MARKETING,
      "marketing.follow_ups": ["create", "read", "update"],
    });
    const companyId = await aCompany(ravi);
    const today = await companyToday(prisma, owner.workspaceId);
    const dueToday = await add(ravi, {
      prospectCompanyId: companyId,
      dueDate: today,
      note: "Ask about the drawings",
    });
    const overdue = await add(ravi, {
      prospectCompanyId: companyId,
      dueDate: addDays(today, -3),
    });
    await add(ravi, {
      prospectCompanyId: companyId,
      dueDate: addDays(today, 2),
    });
    // Owned by someone without Notification: nothing is sent to them.
    await add(ravi, {
      prospectCompanyId: companyId,
      dueDate: today,
      ownerMemberId: quiet.memberId,
    });

    await runReminders();
    await runReminders();
    const sent = await prisma.constructionMessagingNotification.findMany({
      where: {
        workspaceId: owner.workspaceId,
        type: { startsWith: "marketing.follow_up" },
      },
      orderBy: { type: "asc" },
    });
    expect(
      sent.map((row) => [row.type, row.recipientUserId, row.title]),
    ).toEqual([
      ["marketing.follow_up_due", ravi.userId, "Follow-up due today"],
      ["marketing.follow_up_overdue", ravi.userId, "Follow-up overdue"],
    ]);
    expect(sent[0]?.body).toContain("Ask about the drawings");
    // An overdue one already told is not read again by the next runs.
    expect((await readByReminders()).has(overdue.id)).toBe(false);

    // A new due date clears the marks, so the new day is told again.
    const moved = await update(
      jsonRequest(`${BASE}/${overdue.id}/update`, ravi.cookie, {
        type: "call",
        dueDate: today,
        expectedUpdatedAt: overdue.updatedAt,
      }),
      params(overdue.id),
    );
    expect(moved.status).toBe(StatusCodes.OK);
    const row = await prisma.constructionMarketingFollowUp.findUniqueOrThrow({
      where: { id: overdue.id },
    });
    expect(row.overdueNotifiedAt).toBeNull();
    // Sending a reminder does not make an open form stale.
    const read = await json<FollowUp>(
      await getOne(
        jsonRequest(`${BASE}/${dueToday.id}`, ravi.cookie),
        params(dueToday.id),
      ),
    );
    expect(read.updatedAt).toBe(dueToday.updatedAt);
    await runReminders();
    await expect(
      prisma.constructionMessagingNotification.count({
        where: {
          workspaceId: owner.workspaceId,
          type: "marketing.follow_up_due",
        },
      }),
    ).resolves.toBe(2);
  });

  it("tells a new owner too: a change of owner clears both marks", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const priya = await memberWith(owner, MARKETING);
    const companyId = await aCompany(ravi);
    const today = await companyToday(prisma, owner.workspaceId);
    const followUp = await add(ravi, {
      prospectCompanyId: companyId,
      dueDate: today,
    });
    await runReminders();

    const given = await update(
      jsonRequest(`${BASE}/${followUp.id}/update`, ravi.cookie, {
        type: "call",
        dueDate: today,
        ownerMemberId: priya.memberId,
        expectedUpdatedAt: followUp.updatedAt,
      }),
      params(followUp.id),
    );
    expect(given.status).toBe(StatusCodes.OK);
    await expect(
      prisma.constructionMarketingFollowUp.findUniqueOrThrow({
        where: { id: followUp.id },
        select: { dueNotifiedOn: true, overdueNotifiedAt: true },
      }),
    ).resolves.toEqual({ dueNotifiedOn: null, overdueNotifiedAt: null });
    await runReminders();
    const sent = await notices(owner.workspaceId);
    expect(new Set(sent.map((row) => row.recipientUserId))).toEqual(
      new Set([ravi.userId, priya.userId]),
    );
    expect(sent.map((row) => row.type)).toEqual([
      "marketing.follow_up_due",
      "marketing.follow_up_due",
    ]);
  });

  it("goes with its Prospect Company: deleted, out of the list, never reminded", async () => {
    const owner = await ownerWithCompany();
    const companyId = await aCompany(owner);
    const today = await companyToday(prisma, owner.workspaceId);
    const open = await add(owner, {
      prospectCompanyId: companyId,
      dueDate: addDays(today, -1),
    });
    const closed = await add(owner, {
      prospectCompanyId: companyId,
      dueDate: today,
    });
    const cancelled = await cancel(
      jsonRequest(`${BASE}/${closed.id}/cancel`, owner.cookie, {
        expectedUpdatedAt: closed.updatedAt,
      }),
      params(closed.id),
    );
    expect(cancelled.status).toBe(StatusCodes.OK);
    const company = await json<{ updatedAt: string }>(
      await getCompany(
        jsonRequest(`${COMPANIES}/${companyId}`, owner.cookie),
        params(companyId),
      ),
    );

    const deleted = await removeCompany(
      jsonRequest(`${COMPANIES}/${companyId}/delete`, owner.cookie, {
        expectedUpdatedAt: company.updatedAt,
      }),
      params(companyId),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    const gone = await getOne(
      jsonRequest(`${BASE}/${open.id}`, owner.cookie),
      params(open.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
    expect(await ids(owner)).toEqual([]);
    const rows = await prisma.constructionMarketingFollowUp.findMany({
      where: { prospectCompanyId: companyId },
      select: { deletedAt: true, deletedBy: true },
    });
    expect(rows).toHaveLength(2);
    for (const row of rows)
      expect(row).toEqual({
        deletedAt: expect.any(Date) as unknown,
        deletedBy: owner.userId,
      });
    const audit =
      await prisma.constructionOrganizationAuditEvent.findFirstOrThrow({
        where: {
          workspaceId: owner.workspaceId,
          entityId: companyId,
          action: "prospect_company.deleted",
        },
      });
    expect(
      new Set((audit.before as { followUpIds: string[] }).followUpIds),
    ).toEqual(new Set([open.id, closed.id]));

    expect((await readByReminders()).has(open.id)).toBe(false);
    await runReminders();
    expect(await notices(owner.workspaceId)).toEqual([]);
  });

  it("offers the form active Marketing People, and the list everyone", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const left = await memberWith(owner, MARKETING);
    await prisma.constructionOrganizationTeamMember.update({
      where: { id: left.memberId },
      data: { status: "left" },
    });
    const options = await json<{
      selfMemberId: string;
      people: { id: string }[];
      allPeople: { id: string; active: boolean }[];
    }>(await formOptions(jsonRequest(`${BASE}/form-options`, ravi.cookie)));
    expect(options.selfMemberId).toBe(ravi.memberId);
    const people = options.people.map((person) => person.id);
    expect(people).toContain(ravi.memberId);
    expect(people).not.toContain(left.memberId);
    expect(options.allPeople).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: ravi.memberId, active: true }),
        expect.objectContaining({ id: left.memberId, active: false }),
      ]),
    );
  });

  it("needs the Follow-ups menu", async () => {
    const owner = await ownerWithCompany();
    const companyId = await aCompany(owner);
    const reader = await memberWith(owner, {
      "marketing.follow_ups": ["read"],
    });
    const refused = await create(
      jsonRequest(BASE, reader.cookie, {
        type: "call",
        prospectCompanyId: companyId,
        dueDate: "2026-12-01",
      }),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
  });
});

describe("Follow-up writes need Follow-ups read", () => {
  it("refuses every write from a Role with the write flags but no read, and saves nothing", async () => {
    const owner = await ownerWithCompany();
    const companyId = await aCompany(owner);
    const today = await companyToday(prisma, owner.workspaceId);
    const followUp = await add(owner, {
      prospectCompanyId: companyId,
      dueDate: today,
    });
    const blind = await memberWith(owner, {
      "marketing.follow_ups": ["create", "update", "delete"],
      "marketing.companies": ["read", "view_all"],
    });
    const before = await prisma.constructionMarketingFollowUp.count({
      where: { workspaceId: owner.workspaceId },
    });

    const refused = [
      await create(
        jsonRequest(BASE, blind.cookie, {
          type: "call",
          prospectCompanyId: companyId,
          dueDate: today,
        }),
      ),
      await update(
        jsonRequest(`${BASE}/${followUp.id}/update`, blind.cookie, {
          expectedUpdatedAt: followUp.updatedAt,
          type: "call",
          dueDate: today,
          note: "Changed",
        }),
        params(followUp.id),
      ),
      await done(
        jsonRequest(`${BASE}/${followUp.id}/done`, blind.cookie, {
          expectedUpdatedAt: followUp.updatedAt,
        }),
        params(followUp.id),
      ),
      await cancel(
        jsonRequest(`${BASE}/${followUp.id}/cancel`, blind.cookie, {
          expectedUpdatedAt: followUp.updatedAt,
        }),
        params(followUp.id),
      ),
      await remove(
        jsonRequest(`${BASE}/${followUp.id}/delete`, blind.cookie, {
          expectedUpdatedAt: followUp.updatedAt,
        }),
        params(followUp.id),
      ),
    ];
    expect(refused.map((response) => response.status)).toEqual(
      Array(5).fill(StatusCodes.FORBIDDEN),
    );
    expect(
      await prisma.constructionMarketingFollowUp.count({
        where: { workspaceId: owner.workspaceId },
      }),
    ).toBe(before);
    const kept = await prisma.constructionMarketingFollowUp.findUniqueOrThrow({
      where: { id: followUp.id },
    });
    expect(kept).toMatchObject({ status: "open", deletedAt: null, note: null });
    expect(kept.updatedAt.toISOString()).toBe(followUp.updatedAt);
  });
});
