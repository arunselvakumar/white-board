import {
  assertCan,
  can,
  ownScope,
  type MemberAccess,
  type OwnScope,
} from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import { conflict } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import type { NameCursor } from "@/src/shared-kernel/list-cursor";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";

import {
  contactNotFound,
  marketingPersonNotFound,
  prospectCompanyChanged,
  prospectCompanyNameInUse,
  prospectCompanyNotFound,
} from "../domain/marketing-errors";
import type { LostReason, Stage } from "../domain/marketing-terms";
import {
  contactDetails,
  isProspectCompanyVisible,
  manualStageMove,
  primaryContactRequired,
  prospectCompanyDetails,
  prospectCompanyNameKey,
  type ContactDetailsInput,
  type ProspectCompanyDetailsInput,
} from "../domain/prospect-company";
import type {
  MarketingDb,
  MarketingPerson,
  MarketingTeam,
  MarketingTx,
  ProspectCompanyStore,
  StoredContact,
  StoredProspectCompany,
} from "./ports";

export const COMPANIES_MENU = "marketing.companies";

export type ProspectCompanyDeps = {
  db: MarketingDb;
  store: ProspectCompanyStore;
  team: MarketingTeam;
  clock?: () => Date;
};

// ---------------------------------------------------------------------------
// Inputs and read models
// ---------------------------------------------------------------------------

export type CreateProspectCompanyInput = ProspectCompanyDetailsInput & {
  /** An active Marketing Person; the creator when left out (PRD §3.3). */
  assignedMemberId?: string | null;
  /** A first Contact, made primary, so a first visit is one form. */
  primaryContact?: ContactDetailsInput | null;
};

export type ContactInput = ContactDetailsInput & {
  /** Make this the primary Contact; the first Contact always is. */
  isPrimary?: boolean;
};

/** What the viewer may do with a company. */
export type ProspectCompanyActions = {
  canUpdate: boolean;
  canDelete: boolean;
};

export type ProspectCompanyListItem = {
  id: string;
  name: string;
  industry: string | null;
  city: string | null;
  stateCode: string | null;
  stage: Stage;
  assignedTo: { id: string; name: string } | null;
  primaryContact: { name: string; mobile: string | null } | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ContactReadModel = StoredContact;

/** One entry of the company page's timeline, newest first. */
export type ProspectCompanyTimelineItem = {
  kind: "stage";
  id: string;
  /** Null on the company's first entry, its creation at New. */
  fromStage: Stage | null;
  toStage: Stage;
  lostReason: LostReason | null;
  lostReasonText: string | null;
  at: Date;
  byName: string;
};

export type ProspectCompanyReadModel = Omit<
  StoredProspectCompany,
  "assignedMemberId"
> & {
  assignedTo: { id: string; name: string } | null;
  createdByName: string;
  contacts: ContactReadModel[];
  timeline: ProspectCompanyTimelineItem[];
  actions: ProspectCompanyActions;
};

export type ProspectCompanyFormOptions = {
  /** Marketing People, active first use; the form offers only active ones. */
  people: MarketingPerson[];
  /** Industries already typed, for the field's suggestions and the filter. */
  industries: string[];
};

function contactChanged() {
  return conflict(
    "CONTACT_CHANGED",
    "Someone else changed this Contact. Reload the page and try again.",
  );
}

const same = (a: Date, b: Date) => a.getTime() === b.getTime();

/**
 * Prospect Companies and their Contacts (PRD §3.3, ADR CM-0040 §5, §11):
 * list, read, create, edit, delete, Stage moved by hand, and Contacts.
 * Without View all on Companies, a member sees and changes only the
 * companies they created or are assigned; any other answers 404. Every
 * write is one transaction with the row lock and its audit event.
 */
export class ProspectCompanyHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: ProspectCompanyDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  /** Who the viewer sees: everyone with View all, else their own (§5). */
  scope(access: MemberAccess): OwnScope {
    return ownScope(access, COMPANIES_MENU);
  }

  actions(access: MemberAccess): ProspectCompanyActions {
    return {
      canUpdate: can(access, COMPANIES_MENU, "update"),
      canDelete: can(access, COMPANIES_MENU, "delete"),
    };
  }

  /** The live company if the viewer may see it; 404 otherwise. */
  async find(
    access: MemberAccess,
    id: string,
    db: MarketingTx = this.deps.db,
  ): Promise<StoredProspectCompany> {
    const company = await this.deps.store.find(db, access.workspaceId, id);
    if (
      company == null ||
      !isProspectCompanyVisible(company, this.scope(access))
    )
      throw prospectCompanyNotFound();
    return company;
  }

  private async lockVisible(
    tx: MarketingTx,
    access: MemberAccess,
    id: string,
  ): Promise<StoredProspectCompany> {
    const company = await this.deps.store.lock(tx, access.workspaceId, id);
    if (
      company == null ||
      !isProspectCompanyVisible(company, this.scope(access))
    )
      throw prospectCompanyNotFound();
    return company;
  }

  async formOptions(access: MemberAccess): Promise<ProspectCompanyFormOptions> {
    assertCan(access, COMPANIES_MENU, "read");
    const [people, industries] = await Promise.all([
      this.deps.team.people(access.workspaceId),
      this.deps.store.industries(
        this.deps.db,
        access.workspaceId,
        this.scope(access),
      ),
    ]);
    return { people, industries };
  }

  async list(
    access: MemberAccess,
    params: {
      search?: string;
      stages?: readonly Stage[];
      assignedMemberId?: string;
      industry?: string;
      limit: number;
      after?: NameCursor;
    },
  ): Promise<{
    items: ProspectCompanyListItem[];
    hasMore: boolean;
    total: number;
  }> {
    assertCan(access, COMPANIES_MENU, "read");
    const page = await this.deps.store.list(this.deps.db, {
      ...params,
      workspaceId: access.workspaceId,
      scope: this.scope(access),
    });
    const names = await this.deps.team.memberNames(
      access.workspaceId,
      page.items.flatMap((row) =>
        row.assignedMemberId == null ? [] : [row.assignedMemberId],
      ),
    );
    return {
      ...page,
      items: page.items.map((row) => ({
        id: row.id,
        name: row.name,
        industry: row.industry,
        city: row.city,
        stateCode: row.stateCode,
        stage: row.stage,
        assignedTo:
          row.assignedMemberId == null
            ? null
            : {
                id: row.assignedMemberId,
                name: names.get(row.assignedMemberId) ?? "Removed member",
              },
        primaryContact: row.primaryContact,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    };
  }

  async get(
    access: MemberAccess,
    id: string,
  ): Promise<ProspectCompanyReadModel> {
    assertCan(access, COMPANIES_MENU, "read");
    const { db, store, team } = this.deps;
    const company = await this.find(access, id);
    const [contacts, changes] = await Promise.all([
      store.contacts(db, access.workspaceId, id),
      store.stageChanges(db, access.workspaceId, id),
    ]);
    const [members, users] = await Promise.all([
      team.memberNames(
        access.workspaceId,
        company.assignedMemberId == null ? [] : [company.assignedMemberId],
      ),
      team.userNames(access.workspaceId, [
        company.createdBy,
        ...changes.map((change) => change.changedBy),
      ]),
    ]);
    const { assignedMemberId, ...rest } = company;
    return {
      ...rest,
      assignedTo:
        assignedMemberId == null
          ? null
          : {
              id: assignedMemberId,
              name: members.get(assignedMemberId) ?? "Removed member",
            },
      createdByName: users.get(company.createdBy) ?? "Unknown",
      contacts,
      timeline: changes
        .map((change): ProspectCompanyTimelineItem => ({
          kind: "stage",
          id: change.id,
          fromStage: change.fromStage,
          toStage: change.toStage,
          lostReason: change.lostReason,
          lostReasonText: change.lostReasonText,
          at: change.changedAt,
          byName: users.get(change.changedBy) ?? "Unknown",
        }))
        .sort((a, b) => b.at.getTime() - a.at.getTime()),
      actions: this.actions(access),
    };
  }

  /** The assigned person: an active Marketing Person, the creator by default. */
  private async assignee(
    access: MemberAccess,
    memberId: string | null | undefined,
  ): Promise<string | null> {
    const people = await this.deps.team.people(access.workspaceId);
    const active = (id: string) =>
      people.some((person) => person.id === id && person.active);
    if (memberId === undefined) {
      const self =
        access.memberId ??
        (await this.deps.team.memberOfUser(access.workspaceId, access.userId));
      return self != null && active(self) ? self : null;
    }
    if (memberId == null) return null;
    if (!active(memberId)) throw marketingPersonNotFound("assignedMemberId");
    return memberId;
  }

  private async assertNameFree(
    tx: MarketingTx,
    workspaceId: string,
    name: string,
    exceptId: string | null,
  ): Promise<void> {
    if (
      await this.deps.store.nameTaken(
        tx,
        workspaceId,
        prospectCompanyNameKey(name),
        exceptId,
      )
    )
      throw prospectCompanyNameInUse();
  }

  async create(
    access: MemberAccess,
    input: CreateProspectCompanyInput,
  ): Promise<string> {
    assertCan(access, COMPANIES_MENU, "create");
    const details = prospectCompanyDetails(input);
    const contact =
      input.primaryContact == null
        ? null
        : contactDetails(input.primaryContact);
    const assignedMemberId = await this.assignee(
      access,
      input.assignedMemberId,
    );
    const ws = access.workspaceId;
    const id = newId();
    const at = this.clock();
    const by = access.userId;
    try {
      await this.deps.db.$transaction(async (tx) => {
        await this.assertNameFree(tx, ws, details.name, null);
        await this.deps.store.insert(tx, {
          ...details,
          id,
          workspaceId: ws,
          assignedMemberId,
          by,
          at,
        });
        await this.deps.store.appendStageChange(tx, {
          workspaceId: ws,
          prospectCompanyId: id,
          fromStage: null,
          move: { stage: "new", lostReason: null, lostReasonText: null },
          by,
          at,
        });
        const contactId = contact == null ? null : newId();
        if (contact != null && contactId != null)
          await this.deps.store.insertContact(tx, {
            ...contact,
            id: contactId,
            workspaceId: ws,
            prospectCompanyId: id,
            isPrimary: true,
            by,
            at,
          });
        await recordAudit(tx, {
          workspaceId: ws,
          actorUserId: by,
          action: "prospect_company.created",
          entityType: "prospect_company",
          entityId: id,
          after: {
            ...details,
            assignedMemberId,
            stage: "new",
            ...(contact == null ? {} : { primaryContact: contact }),
          },
          occurredAt: at,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw prospectCompanyNameInUse();
      throw error;
    }
    return id;
  }

  /** Edits the details; the assigned person moves only by Reassign. */
  async update(
    access: MemberAccess,
    id: string,
    input: ProspectCompanyDetailsInput & { expectedUpdatedAt: Date },
  ): Promise<void> {
    assertCan(access, COMPANIES_MENU, "update");
    const details = prospectCompanyDetails(input);
    const at = this.clock();
    try {
      await this.deps.db.$transaction(async (tx) => {
        const current = await this.lockVisible(tx, access, id);
        if (!same(current.updatedAt, input.expectedUpdatedAt))
          throw prospectCompanyChanged();
        if (
          prospectCompanyNameKey(details.name) !==
          prospectCompanyNameKey(current.name)
        )
          await this.assertNameFree(tx, access.workspaceId, details.name, id);
        await this.deps.store.update(tx, id, details, access.userId, at);
        await recordAudit(tx, {
          workspaceId: access.workspaceId,
          actorUserId: access.userId,
          action: "prospect_company.updated",
          entityType: "prospect_company",
          entityId: id,
          before: detailsOf(current),
          after: details,
          occurredAt: at,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw prospectCompanyNameInUse();
      throw error;
    }
  }

  /**
   * A tombstone, with its Contacts (ADR CM-0040 §11). Refusing it while the
   * company has Visits comes with Visits.
   */
  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    assertCan(access, COMPANIES_MENU, "delete");
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const current = await this.lockVisible(tx, access, id);
      if (!same(current.updatedAt, expectedUpdatedAt))
        throw prospectCompanyChanged();
      await this.deps.store.remove(tx, id, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "prospect_company.deleted",
        entityType: "prospect_company",
        entityId: id,
        before: { ...detailsOf(current), stage: current.stage },
        occurredAt: at,
      });
    });
  }

  /** A Stage moved by hand (ADR CM-0040 §11), kept in the history. */
  async moveStage(
    access: MemberAccess,
    id: string,
    input: {
      stage: string;
      lostReason?: LostReason | null;
      lostReasonText?: string | null;
      expectedUpdatedAt: Date;
    },
  ): Promise<void> {
    assertCan(access, COMPANIES_MENU, "update");
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const current = await this.lockVisible(tx, access, id);
      if (!same(current.updatedAt, input.expectedUpdatedAt))
        throw prospectCompanyChanged();
      const move = manualStageMove(current.stage, input);
      await this.deps.store.setStage(tx, id, move, access.userId, at);
      await this.deps.store.appendStageChange(tx, {
        workspaceId: access.workspaceId,
        prospectCompanyId: id,
        fromStage: current.stage,
        move,
        by: access.userId,
        at,
      });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "prospect_company.stage_changed",
        entityType: "prospect_company",
        entityId: id,
        before: {
          stage: current.stage,
          lostReason: current.lostReason,
          lostReasonText: current.lostReasonText,
        },
        after: move,
        occurredAt: at,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Contacts: changing them is changing the company (Companies update).
  // -------------------------------------------------------------------------

  async addContact(
    access: MemberAccess,
    companyId: string,
    input: ContactInput,
  ): Promise<string> {
    assertCan(access, COMPANIES_MENU, "update");
    const details = contactDetails(input);
    const id = newId();
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      await this.lockVisible(tx, access, companyId);
      const existing = await this.deps.store.contacts(
        tx,
        access.workspaceId,
        companyId,
      );
      const first = existing.length === 0;
      const primary = first || input.isPrimary === true;
      await this.deps.store.insertContact(tx, {
        ...details,
        id,
        workspaceId: access.workspaceId,
        prospectCompanyId: companyId,
        isPrimary: first,
        by: access.userId,
        at,
      });
      if (primary && !first)
        await this.deps.store.makePrimary(tx, companyId, id, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "prospect_company.contact_added",
        entityType: "prospect_company",
        entityId: companyId,
        after: { contactId: id, ...details, isPrimary: primary },
        occurredAt: at,
      });
    });
    return id;
  }

  private async contactOf(
    tx: MarketingTx,
    access: MemberAccess,
    companyId: string,
    contactId: string,
  ): Promise<{ contact: StoredContact; all: StoredContact[] }> {
    await this.lockVisible(tx, access, companyId);
    const all = await this.deps.store.contacts(
      tx,
      access.workspaceId,
      companyId,
    );
    const contact = all.find((item) => item.id === contactId);
    if (contact == null) throw contactNotFound();
    return { contact, all };
  }

  async updateContact(
    access: MemberAccess,
    companyId: string,
    contactId: string,
    input: ContactInput & { expectedUpdatedAt: Date },
  ): Promise<void> {
    assertCan(access, COMPANIES_MENU, "update");
    const details = contactDetails(input);
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const { contact } = await this.contactOf(
        tx,
        access,
        companyId,
        contactId,
      );
      if (!same(contact.updatedAt, input.expectedUpdatedAt))
        throw contactChanged();
      if (contact.isPrimary && input.isPrimary === false)
        throw primaryContactRequired();
      await this.deps.store.updateContact(
        tx,
        contactId,
        details,
        access.userId,
        at,
      );
      const makePrimary = !contact.isPrimary && input.isPrimary === true;
      if (makePrimary)
        await this.deps.store.makePrimary(
          tx,
          companyId,
          contactId,
          access.userId,
          at,
        );
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "prospect_company.contact_updated",
        entityType: "prospect_company",
        entityId: companyId,
        before: { contactId, ...contactSnapshot(contact) },
        after: {
          contactId,
          ...details,
          isPrimary: contact.isPrimary || makePrimary,
        },
        occurredAt: at,
      });
    });
  }

  /** A tombstone; when it was primary, the oldest other Contact becomes primary. */
  async deleteContact(
    access: MemberAccess,
    companyId: string,
    contactId: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    assertCan(access, COMPANIES_MENU, "update");
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const { contact, all } = await this.contactOf(
        tx,
        access,
        companyId,
        contactId,
      );
      if (!same(contact.updatedAt, expectedUpdatedAt)) throw contactChanged();
      await this.deps.store.removeContact(tx, contactId, access.userId, at);
      const next = all.find((item) => item.id !== contactId);
      if (contact.isPrimary && next != null)
        await this.deps.store.makePrimary(
          tx,
          companyId,
          next.id,
          access.userId,
          at,
        );
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "prospect_company.contact_removed",
        entityType: "prospect_company",
        entityId: companyId,
        before: { contactId, ...contactSnapshot(contact) },
        occurredAt: at,
      });
    });
  }
}

function detailsOf(company: StoredProspectCompany) {
  return {
    name: company.name,
    industry: company.industry,
    address: company.address,
    city: company.city,
    stateCode: company.stateCode,
    pin: company.pin,
    phone: company.phone,
    email: company.email,
    website: company.website,
    gstin: company.gstin,
    source: company.source,
    remarks: company.remarks,
  };
}

function contactSnapshot(contact: StoredContact) {
  return {
    name: contact.name,
    jobTitle: contact.jobTitle,
    mobile: contact.mobile,
    email: contact.email,
    remarks: contact.remarks,
    isPrimary: contact.isPrimary,
  };
}
