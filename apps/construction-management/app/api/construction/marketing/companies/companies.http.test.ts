import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as addContact } from "./[id]/contacts/route";
import { POST as removeContact } from "./[id]/contacts/[contactId]/delete/route";
import { POST as updateContact } from "./[id]/contacts/[contactId]/update/route";
import { POST as remove } from "./[id]/delete/route";
import { GET as getOne } from "./[id]/route";
import { POST as moveStage } from "./[id]/stage/route";
import { POST as update } from "./[id]/update/route";
import { GET as formOptions } from "./form-options/route";
import { GET as list, POST as create } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/marketing/companies`;

type Company = {
  id: string;
  name: string;
  city: string | null;
  stateCode: string | null;
  gstin: string | null;
  stage: string;
  lostReason: string | null;
  lostReasonText: string | null;
  assignedTo: { id: string; name: string } | null;
  createdByName: string;
  updatedAt: string;
  contacts: {
    id: string;
    name: string;
    mobile: string | null;
    isPrimary: boolean;
    updatedAt: string;
  }[];
  timeline: {
    kind: string;
    fromStage: string | null;
    toStage: string;
    lostReason: string | null;
    byName: string;
  }[];
  actions: { canUpdate: boolean; canDelete: boolean };
};

type Page = {
  items: {
    id: string;
    name: string;
    stage: string;
    assignedTo: { id: string; name: string } | null;
    primaryContact: { name: string; mobile: string | null } | null;
  }[];
  nextCursor: string | null;
  total: number;
};

type Session = { cookie: string };

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function contactParams(id: string, contactId: string) {
  return { params: Promise.resolve({ id, contactId }) };
}

async function add(
  who: Session,
  body: Record<string, unknown>,
): Promise<Company> {
  const response = await create(jsonRequest(BASE, who.cookie, body));
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Company>(response);
}

async function names(who: Session, query = ""): Promise<string[]> {
  const response = await list(jsonRequest(`${BASE}${query}`, who.cookie));
  expect(response.status).toBe(StatusCodes.OK);
  return (await json<Page>(response)).items.map((item) => item.name);
}

/** The default Marketing Role's cells (ADR CM-0040 §3). */
const MARKETING = {
  "marketing.dashboard": ["read"],
  "marketing.visits": ["create", "read", "update"],
  "marketing.follow_ups": ["create", "read", "update", "notification"],
  "marketing.companies": ["create", "read", "update"],
} as const;

/** A marketing manager: the Marketing Role duplicated with View all and more. */
const MANAGER = {
  ...MARKETING,
  "marketing.companies": ["create", "read", "update", "delete", "view_all"],
} as const;

describe("Prospect Companies (ADR CM-0040 §5, §11)", () => {
  it("adds a company at New, assigned to the creator, with its first Contact primary", async () => {
    const owner = await ownerWithCompany();
    const company = await add(owner, {
      name: "  Anugraha   Steel ",
      city: "Coimbatore",
      gstin: "33aapfa0939f1zm",
      source: "tender_notice",
      primaryContact: { name: "Ravi Kumar", mobile: "98765 43210" },
    });

    expect(company).toMatchObject({
      name: "Anugraha Steel",
      city: "Coimbatore",
      stateCode: "33",
      gstin: "33AAPFA0939F1ZM",
      stage: "new",
      actions: { canUpdate: true, canDelete: true },
    });
    const self =
      await prisma.constructionOrganizationTeamMember.findFirstOrThrow({
        where: { workspaceId: owner.workspaceId, isOwner: true },
      });
    expect(company.assignedTo?.id).toBe(self.id);
    expect(company.contacts).toEqual([
      expect.objectContaining({
        name: "Ravi Kumar",
        mobile: "+919876543210",
        isPrimary: true,
      }),
    ]);
    expect(company.timeline).toEqual([
      expect.objectContaining({
        kind: "stage",
        fromStage: null,
        toStage: "new",
      }),
    ]);
    await expect(
      prisma.constructionOrganizationAuditEvent.count({
        where: {
          workspaceId: owner.workspaceId,
          action: "prospect_company.created",
          entityId: company.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it("refuses a name in use, ignoring case and spacing, even one the caller cannot see", async () => {
    const owner = await ownerWithCompany();
    const first = await memberWith(owner, MARKETING);
    const second = await memberWith(owner, MARKETING);
    await add(first, { name: "Sri Balaji Builders" });

    const response = await create(
      jsonRequest(BASE, second.cookie, { name: "sri  balaji BUILDERS" }),
    );
    expect(response.status).toBe(StatusCodes.CONFLICT);
    expect(await json(response)).toMatchObject({
      code: "PROSPECT_COMPANY_NAME_IN_USE",
      message: "A Prospect Company with this name already exists.",
    });
  });

  it("shows a member without View all the companies they created or are assigned, and 404 for any other", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const priya = await memberWith(owner, MARKETING);
    const manager = await memberWith(owner, MANAGER);
    const ravis = await add(ravi, { name: "Kaveri Steel" });
    await add(priya, { name: "Pandian Mills" });
    // The Owner assigns one to Ravi.
    const assigned = await add(owner, {
      name: "Madurai Textiles",
      assignedMemberId: ravi.memberId,
    });
    expect(assigned.assignedTo?.id).toBe(ravi.memberId);

    expect(await names(ravi)).toEqual(["Kaveri Steel", "Madurai Textiles"]);
    expect(await names(priya)).toEqual(["Pandian Mills"]);
    expect(await names(manager)).toEqual([
      "Kaveri Steel",
      "Madurai Textiles",
      "Pandian Mills",
    ]);

    // Priya cannot read or change Ravi's company: it is not found.
    const read = await getOne(
      jsonRequest(`${BASE}/${ravis.id}`, priya.cookie),
      params(ravis.id),
    );
    expect(read.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json(read)).toMatchObject({
      code: "PROSPECT_COMPANY_NOT_FOUND",
    });
    const write = await update(
      jsonRequest(`${BASE}/${ravis.id}/update`, priya.cookie, {
        name: "Kaveri Steel",
        expectedUpdatedAt: ravis.updatedAt,
      }),
      params(ravis.id),
    );
    expect(write.status).toBe(StatusCodes.NOT_FOUND);
    const stage = await moveStage(
      jsonRequest(`${BASE}/${ravis.id}/stage`, priya.cookie, {
        stage: "won",
        expectedUpdatedAt: ravis.updatedAt,
      }),
      params(ravis.id),
    );
    expect(stage.status).toBe(StatusCodes.NOT_FOUND);
    const contact = await addContact(
      jsonRequest(`${BASE}/${ravis.id}/contacts`, priya.cookie, {
        name: "Someone",
      }),
      params(ravis.id),
    );
    expect(contact.status).toBe(StatusCodes.NOT_FOUND);

    // The assigned company opens for Ravi, who did not create it.
    const opened = await getOne(
      jsonRequest(`${BASE}/${assigned.id}`, ravi.cookie),
      params(assigned.id),
    );
    expect(opened.status).toBe(StatusCodes.OK);
    expect((await json<Company>(opened)).actions).toEqual({
      canUpdate: true,
      canDelete: false,
    });
  });

  it("searches the name, city, a Contact's name or mobile, and filters by Stage, person and industry", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    await add(owner, {
      name: "Anugraha Steel",
      city: "Coimbatore",
      industry: "Textiles",
      primaryContact: { name: "Lakshmi", mobile: "9840012345" },
    });
    const kaveri = await add(owner, {
      name: "Kaveri Engineering",
      city: "Salem",
      industry: "textiles",
      assignedMemberId: ravi.memberId,
    });
    await add(owner, { name: "Pandian Mills", city: "Madurai" });
    await moveStage(
      jsonRequest(`${BASE}/${kaveri.id}/stage`, owner.cookie, {
        stage: "negotiation",
        expectedUpdatedAt: kaveri.updatedAt,
      }),
      params(kaveri.id),
    );

    expect(await names(owner, "?search=coimba")).toEqual(["Anugraha Steel"]);
    expect(await names(owner, "?search=LAKSH")).toEqual(["Anugraha Steel"]);
    expect(await names(owner, "?search=98400 12")).toEqual(["Anugraha Steel"]);
    expect(await names(owner, "?stage=negotiation,won")).toEqual([
      "Kaveri Engineering",
    ]);
    expect(await names(owner, `?assignedMemberId=${ravi.memberId}`)).toEqual([
      "Kaveri Engineering",
    ]);
    expect(await names(owner, "?industry=TEXTILES")).toEqual([
      "Anugraha Steel",
      "Kaveri Engineering",
    ]);

    const first = await json<Page>(
      await list(jsonRequest(`${BASE}?limit=2`, owner.cookie)),
    );
    expect(first.total).toBe(3);
    expect(first.items.map((item) => item.name)).toEqual([
      "Anugraha Steel",
      "Kaveri Engineering",
    ]);
    expect(first.items[0]?.primaryContact).toEqual({
      name: "Lakshmi",
      mobile: "+919840012345",
    });
    const second = await json<Page>(
      await list(
        jsonRequest(
          `${BASE}?limit=2&after=${first.nextCursor ?? ""}`,
          owner.cookie,
        ),
      ),
    );
    expect(second.items.map((item) => item.name)).toEqual(["Pandian Mills"]);
    expect(second.nextCursor).toBeNull();

    const options = await json<{
      people: { id: string; isOwner: boolean; active: boolean }[];
      industries: string[];
    }>(await formOptions(jsonRequest(`${BASE}/form-options`, owner.cookie)));
    expect(options.industries).toHaveLength(1);
    expect(options.people.map((person) => person.isOwner)).toEqual([
      true,
      false,
    ]);
    expect(options.people[1]?.id).toBe(ravi.memberId);
  });

  it("assigns only an active Marketing Person", async () => {
    const owner = await ownerWithCompany();
    const clerk = await memberWith(owner, {
      "marketing.companies": ["read"],
    });
    const response = await create(
      jsonRequest(BASE, owner.cookie, {
        name: "Kaveri Steel",
        assignedMemberId: clerk.memberId,
      }),
    );
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(response)).toMatchObject({
      code: "MARKETING_PERSON_NOT_FOUND",
      details: { field: "assignedMemberId" },
    });
    // A creator who is not a Marketing Person leaves it unassigned.
    const office = await memberWith(owner, {
      "marketing.companies": ["create", "read"],
    });
    expect(
      (await add(office, { name: "Pandian Mills" })).assignedTo,
    ).toBeNull();
  });

  it("moves the Stage by hand, needs a Lost Reason, and keeps every change", async () => {
    const owner = await ownerWithCompany();
    let company = await add(owner, { name: "Kaveri Steel" });
    const move = async (body: Record<string, unknown>) =>
      moveStage(
        jsonRequest(`${BASE}/${company.id}/stage`, owner.cookie, {
          expectedUpdatedAt: company.updatedAt,
          ...body,
        }),
        params(company.id),
      );

    const contacted = await move({ stage: "contacted" });
    expect(contacted.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(contacted)).toMatchObject({ code: "STAGE_NOT_MANUAL" });
    const noReason = await move({ stage: "lost" });
    expect(await json(noReason)).toMatchObject({
      code: "LOST_REASON_REQUIRED",
    });

    const lost = await move({
      stage: "lost",
      lostReason: "other",
      lostReasonText: "Project shelved",
    });
    expect(lost.status).toBe(StatusCodes.OK);
    company = await json<Company>(lost);
    expect(company).toMatchObject({
      stage: "lost",
      lostReason: "other",
      lostReasonText: "Project shelved",
    });

    const stale = await moveStage(
      jsonRequest(`${BASE}/${company.id}/stage`, owner.cookie, {
        stage: "won",
        expectedUpdatedAt: new Date(0).toISOString(),
      }),
      params(company.id),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);

    company = await json<Company>(await move({ stage: "negotiation" }));
    expect(company).toMatchObject({
      stage: "negotiation",
      lostReason: null,
      lostReasonText: null,
    });
    expect(
      company.timeline.map((item) => [item.fromStage, item.toStage]),
    ).toEqual([
      ["lost", "negotiation"],
      ["new", "lost"],
      [null, "new"],
    ]);
    expect(company.timeline[1]?.lostReason).toBe("other");
  });

  it("edits the details, refusing a stale edit or another company's name", async () => {
    const owner = await ownerWithCompany();
    await add(owner, { name: "Pandian Mills" });
    const company = await add(owner, { name: "Kaveri Steel", city: "Salem" });
    const edit = (body: Record<string, unknown>) =>
      update(
        jsonRequest(`${BASE}/${company.id}/update`, owner.cookie, {
          expectedUpdatedAt: company.updatedAt,
          ...body,
        }),
        params(company.id),
      );

    const taken = await edit({ name: "PANDIAN mills" });
    expect(taken.status).toBe(StatusCodes.CONFLICT);
    const saved = await edit({ name: "Kaveri Steels", pin: "636 001" });
    expect(saved.status).toBe(StatusCodes.OK);
    expect(await json<Company>(saved)).toMatchObject({
      name: "Kaveri Steels",
      city: null,
    });
    const stale = await edit({ name: "Kaveri" });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json(stale)).toMatchObject({
      code: "PROSPECT_COMPANY_CHANGED",
    });
  });

  it("keeps exactly one primary Contact", async () => {
    const owner = await ownerWithCompany();
    const company = await add(owner, { name: "Kaveri Steel" });
    let current = await json<Company>(
      await addContact(
        jsonRequest(`${BASE}/${company.id}/contacts`, owner.cookie, {
          name: "Ravi",
          isPrimary: false,
        }),
        params(company.id),
      ),
    );
    // The first Contact is primary whatever was asked.
    expect(current.contacts.map((c) => [c.name, c.isPrimary])).toEqual([
      ["Ravi", true],
    ]);
    current = await json<Company>(
      await addContact(
        jsonRequest(`${BASE}/${company.id}/contacts`, owner.cookie, {
          name: "Lakshmi",
          mobile: "9840012345",
          isPrimary: true,
        }),
        params(company.id),
      ),
    );
    expect(current.contacts.map((c) => [c.name, c.isPrimary])).toEqual([
      ["Lakshmi", true],
      ["Ravi", false],
    ]);

    const lakshmi = current.contacts[0];
    if (lakshmi == null) throw new Error("No Contact");
    const unset = await updateContact(
      jsonRequest(
        `${BASE}/${company.id}/contacts/${lakshmi.id}/update`,
        owner.cookie,
        {
          name: "Lakshmi",
          isPrimary: false,
          expectedUpdatedAt: lakshmi.updatedAt,
        },
      ),
      contactParams(company.id, lakshmi.id),
    );
    expect(await json(unset)).toMatchObject({
      code: "CONTACT_PRIMARY_REQUIRED",
    });

    current = await json<Company>(
      await removeContact(
        jsonRequest(
          `${BASE}/${company.id}/contacts/${lakshmi.id}/delete`,
          owner.cookie,
          { expectedUpdatedAt: lakshmi.updatedAt },
        ),
        contactParams(company.id, lakshmi.id),
      ),
    );
    expect(current.contacts.map((c) => [c.name, c.isPrimary])).toEqual([
      ["Ravi", true],
    ]);
  });

  it("deletes a company and its Contacts, freeing the name, with Companies delete only", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const company = await add(ravi, {
      name: "Kaveri Steel",
      primaryContact: { name: "Ravi" },
    });

    const refused = await remove(
      jsonRequest(`${BASE}/${company.id}/delete`, ravi.cookie, {
        expectedUpdatedAt: company.updatedAt,
      }),
      params(company.id),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);

    const deleted = await remove(
      jsonRequest(`${BASE}/${company.id}/delete`, owner.cookie, {
        expectedUpdatedAt: company.updatedAt,
      }),
      params(company.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    const read = await getOne(
      jsonRequest(`${BASE}/${company.id}`, owner.cookie),
      params(company.id),
    );
    expect(read.status).toBe(StatusCodes.NOT_FOUND);
    await expect(
      prisma.constructionMarketingContact.count({
        where: { prospectCompanyId: company.id, deletedAt: null },
      }),
    ).resolves.toBe(0);
    await add(owner, { name: "Kaveri Steel" });
  });

  it("needs the Companies menu", async () => {
    const owner = await ownerWithCompany();
    const reader = await memberWith(owner, {
      "marketing.companies": ["read"],
    });
    const outsider = await memberWith(owner, { "marketing.visits": ["read"] });

    const added = await create(
      jsonRequest(BASE, reader.cookie, { name: "Kaveri Steel" }),
    );
    expect(added.status).toBe(StatusCodes.FORBIDDEN);
    const listed = await list(jsonRequest(BASE, outsider.cookie));
    expect(listed.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("does not show another Company's Prospect Company", async () => {
    const owner = await ownerWithCompany();
    const other = await ownerWithCompany("Sri Balaji Builders");
    const company = await add(owner, { name: "Kaveri Steel" });
    const read = await getOne(
      jsonRequest(`${BASE}/${company.id}`, other.cookie),
      params(company.id),
    );
    expect(read.status).toBe(StatusCodes.NOT_FOUND);
    expect(await names(other)).toEqual([]);
  });
});
