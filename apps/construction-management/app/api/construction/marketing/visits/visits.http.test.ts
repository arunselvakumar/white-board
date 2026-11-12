import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import type { PermissionGrants } from "@/src/shared-kernel/access";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as removeCompany } from "../companies/[id]/delete/route";
import { GET as getCompany } from "../companies/[id]/route";
import {
  GET as listCompanies,
  POST as createCompany,
} from "../companies/route";
import { POST as cancel } from "./[id]/cancel/route";
import { POST as complete } from "./[id]/complete/route";
import { POST as remove } from "./[id]/delete/route";
import { POST as addNote } from "./[id]/notes/route";
import { POST as reschedule } from "./[id]/reschedule/route";
import { GET as getOne } from "./[id]/route";
import { POST as update } from "./[id]/update/route";
import { GET as formOptions } from "./form-options/route";
import { GET as list, POST as create } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/marketing/visits`;
const COMPANIES = `${TEST_ORIGIN}/api/construction/marketing/companies`;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type Visit = {
  id: string;
  number: string;
  prospectCompany: { id: string; name: string; canOpen: boolean };
  visitAt: string;
  status: string;
  location: string | null;
  discussion: string | null;
  requirementValue: number | null;
  visitors: { id: string; name: string }[];
  contacts: { id: string; name: string }[];
  notes: { text: string; byName: string }[];
  history: {
    action: string;
    from: string | null;
    to: string | null;
    reason: string | null;
  }[];
  updatedAt: string;
  actions: Record<string, boolean>;
};

type Company = {
  id: string;
  stage: string;
  updatedAt: string;
  contacts: { id: string; name: string; isPrimary: boolean }[];
  timeline: {
    kind: string;
    number?: string;
    toStage?: string;
    text?: string;
  }[];
};

type Session = { cookie: string };

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

async function addCompany(
  who: Session,
  body: Record<string, unknown> = {},
): Promise<Company> {
  const response = await createCompany(
    jsonRequest(COMPANIES, who.cookie, {
      name: `Kaveri Steel ${crypto.randomUUID().slice(0, 6)}`,
      address: "14 Avinashi Road",
      city: "Coimbatore",
      primaryContact: { name: "Lakshmi", mobile: "9840012345" },
      ...body,
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Company>(response);
}

async function plan(
  who: Session,
  body: Record<string, unknown>,
  status = StatusCodes.CREATED,
): Promise<Visit> {
  const response = await create(
    jsonRequest(BASE, who.cookie, {
      status: "planned",
      visitAt: iso(DAY),
      purpose: "introduction",
      ...body,
    }),
  );
  expect(response.status).toBe(status);
  return json<Visit>(response);
}

async function log(
  who: Session,
  company: Company,
  body: Record<string, unknown> = {},
): Promise<Response> {
  return create(
    jsonRequest(BASE, who.cookie, {
      status: "completed",
      prospectCompanyId: company.id,
      visitAt: iso(-HOUR),
      contactIds: company.contacts.map((contact) => contact.id),
      discussion: "Needs a 40 m PEB shed near Sulur.",
      ...body,
    }),
  );
}

async function numbers(who: Session, query = ""): Promise<string[]> {
  const response = await list(jsonRequest(`${BASE}${query}`, who.cookie));
  expect(response.status).toBe(StatusCodes.OK);
  return (await json<{ items: { number: string }[] }>(response)).items.map(
    (item) => item.number,
  );
}

/** The default Marketing Role's cells (ADR CM-0040 §3). */
const MARKETING: PermissionGrants = {
  "marketing.visits": ["create", "read", "update"],
  "marketing.follow_ups": ["create", "read", "update", "notification"],
  "marketing.companies": ["create", "read", "update"],
};

const MANAGER: PermissionGrants = {
  ...MARKETING,
  "marketing.visits": ["create", "read", "update", "delete", "view_all"],
  "marketing.companies": ["create", "read", "update", "delete", "view_all"],
};

describe("Visits (ADR CM-0040 §5, §7)", () => {
  it("plans a Visit numbered MV-0001, by the creator, at the company's address", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const company = await addCompany(ravi);

    const visit = await plan(ravi, { prospectCompanyId: company.id });
    expect(visit).toMatchObject({
      number: "MV-0001",
      status: "planned",
      location: "14 Avinashi Road, Coimbatore",
      visitors: [{ id: ravi.memberId }],
      contacts: [],
      actions: {
        canUpdate: true,
        canComplete: true,
        canCancel: true,
        canDelete: false,
        locked: false,
      },
    });
    expect(visit.history.map((item) => item.action)).toEqual(["created"]);
    expect((await plan(ravi, { prospectCompanyId: company.id })).number).toBe(
      "MV-0002",
    );
    // Planning does not move the Stage.
    const read = await json<Company>(
      await getCompany(
        jsonRequest(`${COMPANIES}/${company.id}`, ravi.cookie),
        params(company.id),
      ),
    );
    expect(read.stage).toBe("new");
  });

  it("logs a first Visit with a new company and Contact in one save, moving it to Contacted", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);

    const response = await create(
      jsonRequest(BASE, ravi.cookie, {
        status: "completed",
        visitAt: iso(-2 * HOUR),
        newProspectCompany: { name: "Pandian Mills", city: "Madurai" },
        newContacts: [{ name: "Meena S", mobile: "9443322110" }],
        discussion: "Wants a quote for a 2,000 sq m shed.",
        interest: "hot",
        requirementWorkType: "shed_erection",
        requirementValue: 4_500_000,
      }),
    );
    expect(response.status).toBe(StatusCodes.CREATED);
    const visit = await json<Visit>(response);
    expect(visit).toMatchObject({
      status: "completed",
      prospectCompany: { name: "Pandian Mills", canOpen: true },
      contacts: [{ name: "Meena S" }],
      requirementValue: 4_500_000,
    });

    const company = await json<Company>(
      await getCompany(
        jsonRequest(`${COMPANIES}/${visit.prospectCompany.id}`, ravi.cookie),
        params(visit.prospectCompany.id),
      ),
    );
    expect(company.stage).toBe("contacted");
    expect(company.contacts).toEqual([
      expect.objectContaining({ name: "Meena S", isPrimary: true }),
    ]);
    expect(company.timeline.map((item) => item.kind)).toEqual(
      expect.arrayContaining(["visit", "stage"]),
    );
    expect(
      company.timeline
        .filter((item) => item.kind === "stage")
        .map((item) => item.toStage),
    ).toEqual(["contacted", "new"]);
  });

  it("completes a planned Visit only with a past time, a point of contact and the Discussion", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const company = await addCompany(ravi);
    const visit = await plan(ravi, {
      prospectCompanyId: company.id,
      visitAt: iso(-HOUR),
    });
    expect(visit.status).toBe("missed");
    const attempt = (body: Record<string, unknown>) =>
      complete(
        jsonRequest(`${BASE}/${visit.id}/complete`, ravi.cookie, {
          visitAt: visit.visitAt,
          expectedUpdatedAt: visit.updatedAt,
          contactIds: company.contacts.map((contact) => contact.id),
          discussion: "Discussed the shed.",
          ...body,
        }),
        params(visit.id),
      );

    expect(await json(await attempt({ contactIds: [] }))).toMatchObject({
      code: "VISIT_CONTACT_REQUIRED",
      details: { field: "contactIds" },
    });
    expect(await json(await attempt({ discussion: " " }))).toMatchObject({
      code: "VISIT_DISCUSSION_REQUIRED",
    });
    expect(await json(await attempt({ visitAt: iso(HOUR) }))).toMatchObject({
      code: "VISIT_IN_FUTURE",
    });

    const done = await attempt({});
    expect(done.status).toBe(StatusCodes.OK);
    const completed = await json<Visit>(done);
    expect(completed.status).toBe("completed");
    expect(completed.history[0]?.action).toBe("completed");
    const again = await attempt({ expectedUpdatedAt: completed.updatedAt });
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect(await json(again)).toMatchObject({ code: "VISIT_NOT_PLANNED" });
  });

  it("shows a member without View all the Visits they created or went on, and 404 for any other", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const priya = await memberWith(owner, MARKETING);
    const anil = await memberWith(owner, MARKETING);
    const manager = await memberWith(owner, MANAGER);
    const ravis = await addCompany(ravi);
    const together = await plan(ravi, {
      prospectCompanyId: ravis.id,
      visitorIds: [ravi.memberId, priya.memberId],
    });
    const alone = await plan(ravi, { prospectCompanyId: ravis.id });

    expect(await numbers(priya)).toEqual([together.number]);
    expect(await numbers(anil)).toEqual([]);
    expect((await numbers(manager)).sort()).toEqual(
      [together.number, alone.number].sort(),
    );

    // Priya went on it, but the company is Ravi's: its name shows, not a link.
    const seen = await json<Visit>(
      await getOne(
        jsonRequest(`${BASE}/${together.id}`, priya.cookie),
        params(together.id),
      ),
    );
    expect(seen.prospectCompany).toMatchObject({
      id: ravis.id,
      canOpen: false,
    });
    const hidden = await getOne(
      jsonRequest(`${BASE}/${alone.id}`, priya.cookie),
      params(alone.id),
    );
    expect(hidden.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json(hidden)).toMatchObject({ code: "VISIT_NOT_FOUND" });
    const note = await addNote(
      jsonRequest(`${BASE}/${alone.id}/notes`, priya.cookie, { text: "Hi" }),
      params(alone.id),
    );
    expect(note.status).toBe(StatusCodes.NOT_FOUND);

    // Without View all a member cannot log a Visit for others only.
    const forOthers = await create(
      jsonRequest(BASE, priya.cookie, {
        status: "planned",
        visitAt: iso(DAY),
        prospectCompanyId: ravis.id,
        visitorIds: [ravi.memberId],
      }),
    );
    expect(await json(forOthers)).toMatchObject({
      code: "VISITOR_SELF_REQUIRED",
      details: { field: "visitorIds" },
    });
    // The manager can.
    expect(
      (
        await plan(manager, {
          prospectCompanyId: ravis.id,
          visitorIds: [ravi.memberId],
        })
      ).visitors,
    ).toEqual([expect.objectContaining({ id: ravi.memberId })]);
  });

  it("reschedules a planned Visit keeping the old time, and cancels one with a reason", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const company = await addCompany(ravi);
    let visit = await plan(ravi, { prospectCompanyId: company.id });

    const edit = await update(
      jsonRequest(`${BASE}/${visit.id}/update`, ravi.cookie, {
        prospectCompanyId: company.id,
        visitAt: iso(2 * DAY),
        expectedUpdatedAt: visit.updatedAt,
      }),
      params(visit.id),
    );
    expect(await json(edit)).toMatchObject({
      code: "VISIT_RESCHEDULE_REQUIRED",
    });

    const newTime = iso(3 * DAY);
    visit = await json<Visit>(
      await reschedule(
        jsonRequest(`${BASE}/${visit.id}/reschedule`, ravi.cookie, {
          visitAt: newTime,
          expectedUpdatedAt: visit.updatedAt,
        }),
        params(visit.id),
      ),
    );
    expect(visit.history[0]).toMatchObject({ action: "rescheduled" });
    expect(new Date(visit.history[0]?.to ?? "").getTime()).toBe(
      new Date(newTime).getTime(),
    );
    expect(visit.history[0]?.from).not.toBeNull();

    const noReason = await cancel(
      jsonRequest(`${BASE}/${visit.id}/cancel`, ravi.cookie, {
        reason: " ",
        expectedUpdatedAt: visit.updatedAt,
      }),
      params(visit.id),
    );
    expect(await json(noReason)).toMatchObject({
      code: "VISIT_CANCEL_REASON_REQUIRED",
    });
    visit = await json<Visit>(
      await cancel(
        jsonRequest(`${BASE}/${visit.id}/cancel`, ravi.cookie, {
          reason: "Plant head on leave",
          expectedUpdatedAt: visit.updatedAt,
        }),
        params(visit.id),
      ),
    );
    expect(visit).toMatchObject({ status: "cancelled" });
    expect(visit.history[0]).toMatchObject({
      action: "cancelled",
      reason: "Plant head on leave",
    });
    expect(visit.actions).toMatchObject({
      canUpdate: false,
      canComplete: false,
    });
  });

  it("keeps a member to the back-dated limit of 7 days for a completed Visit; the Owner is not limited", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const company = await addCompany(ravi);

    const tooOld = await log(ravi, company, { visitAt: iso(-9 * DAY) });
    expect(tooOld.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(tooOld)).toMatchObject({
      code: "BACKDATED_CREATE_BLOCKED",
      details: { module: "marketing_visit", limitDays: 7 },
    });
    expect((await log(ravi, company, { visitAt: iso(-6 * DAY) })).status).toBe(
      StatusCodes.CREATED,
    );
    const ownerCompany = await addCompany(owner);
    expect(
      (await log(owner, ownerCompany, { visitAt: iso(-30 * DAY) })).status,
    ).toBe(StatusCodes.CREATED);
  });

  it("locks a completed Visit for its creator after 7 days, but notes can still be added and View all can edit", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const manager = await memberWith(owner, MANAGER);
    const company = await addCompany(ravi);
    const visit = await json<Visit>(await log(ravi, company));
    await prisma.constructionMarketingVisit.update({
      where: { id: visit.id },
      data: { completedAt: new Date(Date.now() - 8 * DAY) },
    });
    const body = {
      prospectCompanyId: company.id,
      visitAt: visit.visitAt,
      contactIds: company.contacts.map((contact) => contact.id),
      discussion: "Corrected the notes.",
      expectedUpdatedAt: visit.updatedAt,
    };

    const locked = await update(
      jsonRequest(`${BASE}/${visit.id}/update`, ravi.cookie, body),
      params(visit.id),
    );
    expect(locked.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(locked)).toMatchObject({ code: "VISIT_LOCKED" });
    const read = await json<Visit>(
      await getOne(
        jsonRequest(`${BASE}/${visit.id}`, ravi.cookie),
        params(visit.id),
      ),
    );
    expect(read.actions).toMatchObject({
      locked: true,
      canUpdate: false,
      canAddNote: true,
    });

    const noted = await addNote(
      jsonRequest(`${BASE}/${visit.id}/notes`, ravi.cookie, {
        text: "Called back; they want the drawing first.",
      }),
      params(visit.id),
    );
    expect(noted.status).toBe(StatusCodes.CREATED);
    expect((await json<Visit>(noted)).notes[0]).toMatchObject({
      text: "Called back; they want the drawing first.",
    });

    const edited = await update(
      jsonRequest(`${BASE}/${visit.id}/update`, manager.cookie, body),
      params(visit.id),
    );
    expect(edited.status).toBe(StatusCodes.OK);
    expect((await json<Visit>(edited)).discussion).toBe("Corrected the notes.");
  });

  it("filters by status (Missed included), dates, visitor and company", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const first = await addCompany(owner);
    const second = await addCompany(owner);
    const missed = await plan(owner, {
      prospectCompanyId: first.id,
      visitAt: iso(-2 * HOUR),
    });
    const upcoming = await plan(owner, {
      prospectCompanyId: second.id,
      visitAt: iso(5 * DAY),
      visitorIds: [ravi.memberId],
    });
    const done = await json<Visit>(await log(owner, first));

    expect(await numbers(owner, "?status=missed")).toEqual([missed.number]);
    expect(await numbers(owner, "?status=planned")).toEqual([upcoming.number]);
    expect(await numbers(owner, "?status=completed,missed")).toEqual([
      done.number,
      missed.number,
    ]);
    expect(await numbers(owner, `?memberId=${ravi.memberId}`)).toEqual([
      upcoming.number,
    ]);
    expect(await numbers(owner, `?prospectCompanyId=${second.id}`)).toEqual([
      upcoming.number,
    ]);
    const inFiveDays = new Date(Date.now() + 5 * DAY)
      .toISOString()
      .slice(0, 10);
    expect(await numbers(owner, `?from=${inFiveDays}`)).toEqual([
      upcoming.number,
    ]);

    const companies = await json<{
      items: { id: string; lastVisitAt: string | null }[];
    }>(await listCompanies(jsonRequest(COMPANIES, owner.cookie)));
    expect(
      companies.items.find((item) => item.id === first.id)?.lastVisitAt,
    ).not.toBeNull();
    expect(
      companies.items.find((item) => item.id === second.id)?.lastVisitAt,
    ).toBeNull();
  });

  it("refuses to delete a company with Visits until they are deleted", async () => {
    const owner = await ownerWithCompany();
    const company = await addCompany(owner);
    const visit = await plan(owner, { prospectCompanyId: company.id });

    const refused = await removeCompany(
      jsonRequest(`${COMPANIES}/${company.id}/delete`, owner.cookie, {
        expectedUpdatedAt: company.updatedAt,
      }),
      params(company.id),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await json(refused)).toMatchObject({
      code: "PROSPECT_COMPANY_HAS_VISITS",
    });

    const deleted = await remove(
      jsonRequest(`${BASE}/${visit.id}/delete`, owner.cookie, {
        expectedUpdatedAt: visit.updatedAt,
      }),
      params(visit.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    const allowed = await removeCompany(
      jsonRequest(`${COMPANIES}/${company.id}/delete`, owner.cookie, {
        expectedUpdatedAt: company.updatedAt,
      }),
      params(company.id),
    );
    expect(allowed.status).toBe(StatusCodes.NO_CONTENT);
  });

  it("offers the form the active Marketing People and the caller's own companies", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const mine = await addCompany(ravi);
    await addCompany(owner);
    const options = await json<{
      selfMemberId: string;
      mustIncludeSelf: boolean;
      companies: { id: string }[];
      people: { id: string }[];
    }>(await formOptions(jsonRequest(`${BASE}/form-options`, ravi.cookie)));
    expect(options).toMatchObject({
      selfMemberId: ravi.memberId,
      mustIncludeSelf: true,
    });
    expect(options.companies.map((company) => company.id)).toEqual([mine.id]);
    expect(options.people.map((person) => person.id)).toContain(ravi.memberId);
  });

  it("needs the Visits menu", async () => {
    const owner = await ownerWithCompany();
    const company = await addCompany(owner);
    const reader = await memberWith(owner, {
      "marketing.visits": ["read"],
      "marketing.companies": ["read"],
    });
    const refused = await create(
      jsonRequest(BASE, reader.cookie, {
        status: "planned",
        visitAt: iso(DAY),
        prospectCompanyId: company.id,
      }),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
  });
});
