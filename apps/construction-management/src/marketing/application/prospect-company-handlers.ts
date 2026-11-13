import {
  assertCan,
  can,
  ownScope,
  type MemberAccess,
  type OwnScope,
} from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { conflict } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import type { NameCursor } from "@/src/shared-kernel/list-cursor";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";

import {
  contactNotFound,
  marketingPersonNotFound,
  prospectCompanyChanged,
  prospectCompanyHasVisits,
  prospectCompanyNameInUse,
  prospectCompanyNotFound,
} from "../domain/marketing-errors";
import type {
  FollowUpStatus,
  FollowUpType,
  LostReason,
  Stage,
  VisitPurpose,
  VisitShownStatus,
} from "../domain/marketing-terms";
import { shownStatus } from "../domain/visit";
import {
  contactDetails,
  isProspectCompanyVisible,
  manualStageMove,
  primaryContactRequired,
  prospectCompanyDetails,
  prospectCompanyNameKey,
  type ContactDetails,
  type ContactDetailsInput,
  type ProspectCompanyDetails,
  type ProspectCompanyDetailsInput,
} from "../domain/prospect-company";
import type {
  CompanyFollowUpsReader,
  CompanyVisitsReader,
  MarketingDb,
  MarketingPerson,
  MarketingTeam,
  MarketingTx,
  ProspectCompanyStore,
  StoredContact,
  StoredProspectCompany,
} from "./ports";

export const COMPANIES_MENU = "marketing.companies";
const VISITS_MENU = "marketing.visits";
const FOLLOW_UPS_MENU = "marketing.follow_ups";

export type ProspectCompanyDeps = {
  db: MarketingDb;
  store: ProspectCompanyStore;
  team: MarketingTeam;
  /** Visits on the company page and list, and the delete check. */
  visits: CompanyVisitsReader;
  /** Follow-ups on the company page, and the list's next due date. */
  followUps: CompanyFollowUpsReader;
  /** The Company's time zone, for the page's times. */
  timeZone: (workspaceId: string) => Promise<string>;
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

/** A new company checked and ready for its transaction. */
export type PreparedCompany = {
  details: ProspectCompanyDetails;
  contact: ContactDetails | null;
  assignedMemberId: string | null;
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
  /** The latest completed Visit the viewer may see. */
  lastVisitAt: Date | null;
  /** The earliest open Follow-up the viewer may see. */
  nextFollowUpOn: CalendarDate | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ContactReadModel = StoredContact;

/** One entry of the company page's timeline, newest first. */
export type ProspectCompanyTimelineItem =
  | {
      kind: "stage";
      id: string;
      /** Null on the company's first entry, its creation at New. */
      fromStage: Stage | null;
      toStage: Stage;
      lostReason: LostReason | null;
      lostReasonText: string | null;
      at: Date;
      byName: string;
    }
  | {
      kind: "visit";
      id: string;
      number: string;
      /** The Visit's time. */
      at: Date;
      status: VisitShownStatus;
      purpose: VisitPurpose | null;
      outcome: string | null;
      visitorNames: string[];
    }
  | {
      kind: "note";
      id: string;
      visitId: string;
      visitNumber: string;
      text: string;
      at: Date;
      byName: string;
    }
  | {
      kind: "follow_up";
      id: string;
      visitId: string | null;
      visitNumber: string | null;
      type: FollowUpType;
      status: FollowUpStatus;
      dueDate: CalendarDate;
      ownerName: string;
      note: string | null;
      resultNote: string | null;
      at: Date;
    }
  | {
      kind: "file";
      id: string;
      visitId: string;
      visitNumber: string;
      fileName: string;
      caption: string | null;
      at: Date;
      byName: string;
    };

export type ProspectCompanyReadModel = Omit<
  StoredProspectCompany,
  "assignedMemberId"
> & {
  assignedTo: { id: string; name: string } | null;
  createdByName: string;
  /** The Company's time zone: the page shows times in it. */
  timeZone: string;
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
 * A write also needs Companies read, checked first: the route answers with
 * the company read back, so a write without read would save and then fail.
 */
function assertCanWrite(
  access: MemberAccess,
  flag: "create" | "update" | "delete",
): void {
  assertCan(access, COMPANIES_MENU, "read");
  assertCan(access, COMPANIES_MENU, flag);
}

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

  /**
   * The viewer's scope on Follow-ups, with the Owner's own member id, so a
   * Follow-up they own shows without View all too.
   */
  private async followUpScope(access: MemberAccess): Promise<OwnScope> {
    const scope = ownScope(access, FOLLOW_UPS_MENU);
    if (scope == null || scope.memberId != null) return scope;
    return {
      ...scope,
      memberId: await this.deps.team.memberOfUser(
        access.workspaceId,
        access.userId,
      ),
    };
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
    /** The Company's, for Last visit. */
    timeZone: string;
  }> {
    assertCan(access, COMPANIES_MENU, "read");
    const page = await this.deps.store.list(this.deps.db, {
      ...params,
      workspaceId: access.workspaceId,
      scope: this.scope(access),
    });
    const [names, lastVisits, timeZone, nextDue] = await Promise.all([
      this.deps.team.memberNames(
        access.workspaceId,
        page.items.flatMap((row) =>
          row.assignedMemberId == null ? [] : [row.assignedMemberId],
        ),
      ),
      can(access, VISITS_MENU, "read")
        ? this.deps.visits.lastVisits(
            this.deps.db,
            access.workspaceId,
            page.items.map((row) => row.id),
            ownScope(access, VISITS_MENU),
          )
        : new Map<string, Date>(),
      this.deps.timeZone(access.workspaceId),
      can(access, FOLLOW_UPS_MENU, "read")
        ? this.followUpScope(access).then((scope) =>
            this.deps.followUps.nextDue(
              this.deps.db,
              access.workspaceId,
              page.items.map((row) => row.id),
              scope,
            ),
          )
        : new Map<string, CalendarDate>(),
    ]);
    return {
      ...page,
      timeZone,
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
        lastVisitAt: lastVisits.get(row.id) ?? null,
        nextFollowUpOn: nextDue.get(row.id) ?? null,
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
    const [contacts, changes, visits, followUps] = await Promise.all([
      store.contacts(db, access.workspaceId, id),
      store.stageChanges(db, access.workspaceId, id),
      can(access, VISITS_MENU, "read")
        ? this.deps.visits.timeline(
            db,
            access.workspaceId,
            id,
            ownScope(access, VISITS_MENU),
          )
        : { visits: [], notes: [], files: [] },
      can(access, FOLLOW_UPS_MENU, "read")
        ? this.followUpScope(access).then((scope) =>
            this.deps.followUps.forCompany(db, access.workspaceId, id, scope),
          )
        : Promise.resolve([]),
    ]);
    const [members, users, timeZone] = await Promise.all([
      team.memberNames(access.workspaceId, [
        ...(company.assignedMemberId == null ? [] : [company.assignedMemberId]),
        ...visits.visits.flatMap((visit) => visit.visitorIds),
        ...followUps.map((followUp) => followUp.ownerMemberId),
      ]),
      team.userNames(access.workspaceId, [
        company.createdBy,
        ...changes.map((change) => change.changedBy),
        ...visits.notes.map((note) => note.createdBy),
        ...visits.files.map((file) => file.createdBy),
      ]),
      this.deps.timeZone(access.workspaceId),
    ]);
    const { assignedMemberId, ...rest } = company;
    const now = this.clock();
    const numbers = new Map(
      visits.visits.map((visit) => [visit.id, visit.number]),
    );
    const timeline: ProspectCompanyTimelineItem[] = [
      ...changes.map((change): ProspectCompanyTimelineItem => ({
        kind: "stage",
        id: change.id,
        fromStage: change.fromStage,
        toStage: change.toStage,
        lostReason: change.lostReason,
        lostReasonText: change.lostReasonText,
        at: change.changedAt,
        byName: users.get(change.changedBy) ?? "Unknown",
      })),
      ...visits.visits.map((visit): ProspectCompanyTimelineItem => ({
        kind: "visit",
        id: visit.id,
        number: visit.number,
        at: visit.visitAt,
        status: shownStatus(visit, now),
        purpose: visit.purpose,
        outcome: visit.outcome,
        visitorNames: visit.visitorIds.map(
          (memberId) => members.get(memberId) ?? "Removed member",
        ),
      })),
      ...visits.notes.map((note): ProspectCompanyTimelineItem => ({
        kind: "note",
        id: note.id,
        visitId: note.visitId,
        visitNumber: numbers.get(note.visitId) ?? "",
        text: note.text,
        at: note.createdAt,
        byName: users.get(note.createdBy) ?? "Unknown",
      })),
      ...followUps.map((followUp): ProspectCompanyTimelineItem => ({
        kind: "follow_up",
        id: followUp.id,
        visitId: followUp.visitId,
        visitNumber:
          followUp.visitId == null
            ? null
            : (numbers.get(followUp.visitId) ?? null),
        type: followUp.type,
        status: followUp.status,
        dueDate: followUp.dueDate,
        ownerName: members.get(followUp.ownerMemberId) ?? "Removed member",
        note: followUp.note,
        resultNote: followUp.resultNote,
        // Done ones sit where they were done, others where they were made.
        at: followUp.doneAt ?? followUp.createdAt,
      })),
      ...visits.files.map((file): ProspectCompanyTimelineItem => ({
        kind: "file",
        id: file.id,
        visitId: file.visitId,
        visitNumber: numbers.get(file.visitId) ?? "",
        fileName: file.fileName,
        caption: file.caption,
        at: file.createdAt,
        byName: users.get(file.createdBy) ?? "Unknown",
      })),
    ];
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
      timeZone,
      contacts,
      timeline: timeline.sort((a, b) => b.at.getTime() - a.at.getTime()),
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
    const prepared = await this.prepareCreate(access, input);
    try {
      return await this.deps.db.$transaction((tx) =>
        this.createInTx(tx, access, prepared),
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw prospectCompanyNameInUse();
      throw error;
    }
  }

  /**
   * Checks a new company before its transaction: Companies create, the
   * form, and the assigned person. The Visit form uses it too (PRD §3.3).
   */
  async prepareCreate(
    access: MemberAccess,
    input: CreateProspectCompanyInput,
  ): Promise<PreparedCompany> {
    assertCanWrite(access, "create");
    return {
      details: prospectCompanyDetails(input),
      contact:
        input.primaryContact == null
          ? null
          : contactDetails(input.primaryContact),
      assignedMemberId: await this.assignee(access, input.assignedMemberId),
    };
  }

  /**
   * Adds a prepared company inside the caller's transaction, at New, with
   * its first Contact. A name in use is 409 here; a race on it surfaces as
   * a unique violation the caller maps.
   */
  async createInTx(
    tx: MarketingTx,
    access: MemberAccess,
    prepared: PreparedCompany,
  ): Promise<string> {
    const { details, contact, assignedMemberId } = prepared;
    const ws = access.workspaceId;
    const id = newId();
    const at = this.clock();
    const by = access.userId;
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
    if (contact != null)
      await this.deps.store.insertContact(tx, {
        ...contact,
        id: newId(),
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
    return id;
  }

  /**
   * New to Contacted on a company's first completed Visit (ADR CM-0040
   * §7), in the Visit's transaction; any other Stage is left as it is.
   */
  async markContactedInTx(
    tx: MarketingTx,
    access: MemberAccess,
    companyId: string,
  ): Promise<void> {
    const company = await this.deps.store.lock(
      tx,
      access.workspaceId,
      companyId,
    );
    if (company?.stage !== "new") return;
    const at = this.clock();
    const move = {
      stage: "contacted" as const,
      lostReason: null,
      lostReasonText: null,
    };
    await this.deps.store.setStage(tx, companyId, move, access.userId, at);
    await this.deps.store.appendStageChange(tx, {
      workspaceId: access.workspaceId,
      prospectCompanyId: companyId,
      fromStage: "new",
      move,
      by: access.userId,
      at,
    });
    await recordAudit(tx, {
      workspaceId: access.workspaceId,
      actorUserId: access.userId,
      action: "prospect_company.stage_changed",
      entityType: "prospect_company",
      entityId: companyId,
      before: { stage: "new" },
      after: { ...move, byVisit: true },
      occurredAt: at,
    });
  }

  /** Edits the details; the assigned person moves only by Reassign. */
  async update(
    access: MemberAccess,
    id: string,
    input: ProspectCompanyDetailsInput & { expectedUpdatedAt: Date },
  ): Promise<void> {
    assertCanWrite(access, "update");
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
   * A tombstone, with its Contacts and all its Follow-ups (ADR CM-0040
   * §11); refused while the company has Visits, whoever logged them.
   */
  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    assertCanWrite(access, "delete");
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const current = await this.lockVisible(tx, access, id);
      if (!same(current.updatedAt, expectedUpdatedAt))
        throw prospectCompanyChanged();
      if ((await this.deps.visits.liveCount(tx, access.workspaceId, id)) > 0)
        throw prospectCompanyHasVisits();
      await this.deps.store.remove(tx, id, access.userId, at);
      const followUpIds = await this.deps.followUps.removeForCompany(tx, {
        workspaceId: access.workspaceId,
        companyId: id,
        by: access.userId,
        now: at,
      });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "prospect_company.deleted",
        entityType: "prospect_company",
        entityId: id,
        before: { ...detailsOf(current), stage: current.stage, followUpIds },
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
    assertCanWrite(access, "update");
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const current = await this.lockVisible(tx, access, id);
      if (!same(current.updatedAt, input.expectedUpdatedAt))
        throw prospectCompanyChanged();
      const move = manualStageMove(current, input);
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
    assertCanWrite(access, "update");
    const details = contactDetails(input);
    return this.deps.db.$transaction(async (tx) => {
      await this.lockVisible(tx, access, companyId);
      return this.addContactInTx(tx, access, companyId, {
        ...details,
        isPrimary: input.isPrimary,
      });
    });
  }

  /**
   * Adds a checked Contact to a company the caller has locked: the first,
   * or one marked primary, becomes the primary Contact.
   */
  async addContactInTx(
    tx: MarketingTx,
    access: MemberAccess,
    companyId: string,
    input: ContactDetails & { isPrimary?: boolean },
  ): Promise<string> {
    const { isPrimary, ...details } = input;
    const id = newId();
    const at = this.clock();
    const existing = await this.deps.store.contacts(
      tx,
      access.workspaceId,
      companyId,
    );
    const first = existing.length === 0;
    const primary = first || isPrimary === true;
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
    assertCanWrite(access, "update");
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
    assertCanWrite(access, "update");
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
