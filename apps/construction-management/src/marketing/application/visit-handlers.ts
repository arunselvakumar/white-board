import {
  assertCan,
  can,
  ownScope,
  type MemberAccess,
  type OwnScope,
} from "@/src/shared-kernel/access";
import type { AuditRecord } from "@/src/shared-kernel/audit-reader";
import { recordAudit } from "@/src/shared-kernel/audit";
import { addDays, type CalendarDate } from "@/src/shared-kernel/calendar-date";
import { conflict, type DomainError } from "@/src/shared-kernel/domain-error";
import type { ObjectStorage } from "@/src/shared-kernel/files";
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";

import {
  invalidField,
  marketingPersonNotFound,
  prospectCompanyNameInUse,
  prospectCompanyNotFound,
} from "../domain/marketing-errors";
import type {
  Interest,
  VisitPurpose,
  VisitShownStatus,
  VisitStatus,
} from "../domain/marketing-terms";
import {
  contactDetails,
  isProspectCompanyVisible,
  type ContactDetailsInput,
} from "../domain/prospect-company";
import {
  assertCanCheckIn,
  assertCanCheckOut,
  assertCanReschedule,
  assertCompletable,
  assertPlanned,
  checkPoint,
  cancelReason,
  isVisitLocked,
  isVisitVisible,
  noteText,
  shownStatus,
  visitDetails,
  visitLocked,
  visitNotFound,
  visitorIds,
  type CheckPosition,
  type VisitDetails,
  type VisitDetailsInput,
} from "../domain/visit";
import type {
  MarketingDb,
  MarketingPerson,
  MarketingTeam,
  MarketingTx,
  ProspectCompanyStore,
  StoredVisit,
  VisitCheck,
  VisitFileStore,
  VisitRow,
  VisitStore,
} from "./ports";
import type { FollowUpHandlers, FollowUpInput } from "./follow-up-handlers";
import type {
  CreateProspectCompanyInput,
  ProspectCompanyHandlers,
} from "./prospect-company-handlers";

export const VISITS_MENU = "marketing.visits";
const COMPANIES_MENU = "marketing.companies";

/** Checks one Visit date against the Back-dated Entry policy (CM-113). */
export type VisitBackdatedCheck = (
  action: "create" | "edit",
  date: CalendarDate,
) => void;

export type VisitDeps = {
  db: MarketingDb;
  store: VisitStore;
  companyStore: ProspectCompanyStore;
  /** Its photos and files (ADR CM-0040 §9). */
  fileStore: VisitFileStore;
  /** Where those files are; a deleted Visit's objects go after the commit. */
  storage: ObjectStorage;
  /** Inline company and Contacts, and New → Contacted. */
  companies: ProspectCompanyHandlers;
  /** A Next Follow-up saved with the Visit (PRD §3.4, §3.5). */
  followUps: FollowUpHandlers;
  team: MarketingTeam;
  /** The `marketing_visit` limits for this member, on the Company's today. */
  backdated: (access: MemberAccess) => Promise<VisitBackdatedCheck>;
  timeZone: (workspaceId: string) => Promise<string>;
  /** The Company's today. */
  today: (workspaceId: string) => Promise<CalendarDate>;
  /** The Visit's calendar date in the Company time zone. */
  dateIn: (instant: Date, timeZone: string) => CalendarDate;
  /** Midnight starting a day in the Company time zone. */
  dayStart: (date: CalendarDate, timeZone: string) => Date;
  /** `MV-0001`, inside the Visit's transaction. */
  nextNumber: (
    tx: MarketingTx,
    input: { workspaceId: string; date: CalendarDate; by: string },
  ) => Promise<{ number: string; sequence: number }>;
  /** The Visit's audit events, oldest first. */
  history: (workspaceId: string, visitId: string) => Promise<AuditRecord[]>;
  clock?: () => Date;
};

// ---------------------------------------------------------------------------
// Inputs and read models
// ---------------------------------------------------------------------------

export type VisitWriteInput = VisitDetailsInput & {
  visitAt: Date;
  /** Marketing People; the creator when left out. */
  visitorIds?: readonly string[];
  /** Contacts of the Visit's company. */
  contactIds?: readonly string[];
  /** Contacts added to the company in the same save (PRD §3.3). */
  newContacts?: readonly ContactDetailsInput[];
  /**
   * Saving makes it a Follow-up of this Visit, in the same transaction
   * (Follow-ups create). Read on create and complete.
   */
  nextFollowUp?: FollowUpInput | null;
};

export type CreateVisitInput = VisitWriteInput & {
  /** A live Prospect Company, or `newProspectCompany`. */
  prospectCompanyId?: string;
  newProspectCompany?: CreateProspectCompanyInput;
  /** Planned, or logged straight as Completed. */
  status: "planned" | "completed";
};

export type VisitActions = {
  /** Edit the details (and, when Completed, the time). */
  canUpdate: boolean;
  canComplete: boolean;
  canCancel: boolean;
  canReschedule: boolean;
  canAddNote: boolean;
  /** Add photos and files; allowed past the lock, like notes. */
  canAddFiles: boolean;
  /** A visitor, on a Planned Visit dated today, not yet checked in. */
  canCheckIn: boolean;
  /** A visitor, after the check-in, not yet out. */
  canCheckOut: boolean;
  canDelete: boolean;
  /** A Completed Visit past its 7 days for this viewer. */
  locked: boolean;
};

export type VisitListItem = {
  id: string;
  number: string;
  prospectCompany: { id: string; name: string; canOpen: boolean };
  visitAt: Date;
  status: VisitShownStatus;
  purpose: VisitPurpose | null;
  interest: Interest | null;
  outcome: string | null;
  visitors: { id: string; name: string }[];
  contactNames: string[];
  /** Checked in at the site (ADR CM-0040 §10). */
  checkedIn: boolean;
};

export type VisitHistoryItem = {
  id: string;
  action:
    | "created"
    | "updated"
    | "completed"
    | "rescheduled"
    | "cancelled"
    | "note_added"
    | "file_added"
    | "file_removed"
    | "checked_in"
    | "checked_out";
  at: Date;
  byName: string;
  /** Rescheduled: the old and new times. */
  from: Date | null;
  to: Date | null;
  /** Cancelled: the reason. */
  reason: string | null;
  /** A file added or removed: its name. */
  fileName: string | null;
};

/** A check-in or check-out as the Visit page shows it. */
export type VisitCheckView = VisitCheck & { byName: string };

/** A photo or file on the Visit, oldest first. */
export type VisitFileSummary = {
  id: string;
  fileName: string;
  contentType: string;
  bytes: number;
  /** A PDF or an image, which the browser shows. */
  viewable: boolean;
  hasThumbnail: boolean;
  caption: string | null;
  createdByName: string;
  createdAt: Date;
  /** Its uploader, or View all, with Visits update: caption and remove. */
  canChange: boolean;
};

export type VisitReadModel = VisitDetails & {
  id: string;
  number: string;
  prospectCompany: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    /** The company page opens for the viewer (ADR CM-0040 §5). */
    canOpen: boolean;
  };
  visitAt: Date;
  status: VisitShownStatus;
  cancelReason: string | null;
  completedAt: Date | null;
  visitors: { id: string; name: string }[];
  contacts: {
    id: string;
    name: string;
    jobTitle: string | null;
    mobile: string | null;
  }[];
  notes: { id: string; text: string; at: Date; byName: string }[];
  files: VisitFileSummary[];
  /** Kept with the Visit only; not in the register or any export. */
  checkIn: VisitCheckView | null;
  checkOut: VisitCheckView | null;
  history: VisitHistoryItem[];
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  timeZone: string;
  actions: VisitActions;
};

export type VisitFormOptions = {
  /** Active Marketing People: the ones a Visit can name. */
  people: MarketingPerson[];
  /** Inactive ones too, whose past Visits remain: the list's filter. */
  allPeople: MarketingPerson[];
  /** The caller's own Team Member id: the default visitor. */
  selfMemberId: string | null;
  /** Without View all the caller must stay among the visitors. */
  mustIncludeSelf: boolean;
  /** The Prospect Companies the caller can pick, A–Z. */
  companies: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
  }[];
  canCreateCompany: boolean;
  canAddContacts: boolean;
  timeZone: string;
};

const HISTORY_ACTIONS = new Set([
  "visit.created",
  "visit.updated",
  "visit.completed",
  "visit.rescheduled",
  "visit.cancelled",
  "visit.note_added",
  "visit.file_added",
  "visit.file_removed",
  "visit.checked_in",
  "visit.checked_out",
]);

function visitNumberInUse(): DomainError {
  return conflict(
    "VISIT_NUMBER_IN_USE",
    "This Visit number is already used. Check Manage Sequence IDs.",
  );
}

/**
 * A unique index refused the Visit's save: the Prospect Company name
 * (`prospect_companies_workspace_name_live_key` on `name_key`) or the Visit
 * number (`visits_workspace_id_number_key`). Any other is left as it is.
 */
function mapUniqueViolation(error: unknown): unknown {
  if (!isUniqueViolation(error)) return error;
  const target = JSON.stringify(error.meta ?? {});
  if (target.includes("name_key") || target.includes("workspace_name_live"))
    return prospectCompanyNameInUse();
  if (target.includes("number")) return visitNumberInUse();
  return error;
}

/** Every Visit write needs Visits read as well as its own flag. */
function assertCanWrite(
  access: MemberAccess,
  flag: "create" | "update" | "delete",
): void {
  assertCan(access, VISITS_MENU, "read");
  assertCan(access, VISITS_MENU, flag);
}

function visitChanged() {
  return conflict(
    "VISIT_CHANGED",
    "Someone else changed this Visit. Reload it and try again.",
  );
}

const same = (a: Date, b: Date) => a.getTime() === b.getTime();

const VIEWABLE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

/** The file named by a `visit.file_added` / `.file_removed` event. */
function fileNameOf(event: AuditRecord): string | null {
  if (
    event.action !== "visit.file_added" &&
    event.action !== "visit.file_removed"
  )
    return null;
  const payload = (
    event.action === "visit.file_added" ? event.after : event.before
  ) as Record<string, unknown> | null;
  const name = payload?.["fileName"];
  return typeof name === "string" ? name : null;
}

function dateOf(value: unknown): Date | null {
  return typeof value === "string" ? new Date(value) : null;
}

function snapshot(visit: Partial<StoredVisit>) {
  return {
    prospectCompanyId: visit.prospectCompanyId,
    visitAt: visit.visitAt?.toISOString(),
    status: visit.status,
    purpose: visit.purpose,
    location: visit.location,
    discussion: visit.discussion,
    outcome: visit.outcome,
    interest: visit.interest,
    requirementWorkType: visit.requirementWorkType,
    requirementValue: visit.requirementValue,
    requirementStartMonth: visit.requirementStartMonth,
    visitorIds: visit.visitorIds,
    contactIds: visit.contactIds,
  };
}

/**
 * Visits (PRD §3.4, ADR CM-0040 §5, §7): plan or log one, edit it,
 * complete, reschedule or cancel a planned one, add notes, delete it, and
 * list and read them. Without View all on Visits, a member sees and
 * changes only the Visits they created or are a visitor on; any other
 * answers 404. Every write is one transaction with the row lock and its
 * audit event.
 */
export class VisitHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: VisitDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  scope(access: MemberAccess): OwnScope {
    return ownScope(access, VISITS_MENU);
  }

  private async self(access: MemberAccess): Promise<string | null> {
    return (
      access.memberId ??
      (await this.deps.team.memberOfUser(access.workspaceId, access.userId))
    );
  }

  /** The caller's scope with their member id filled in for the Owner too. */
  private async ownScope(access: MemberAccess): Promise<OwnScope> {
    const scope = this.scope(access);
    if (scope == null || scope.memberId != null) return scope;
    return { ...scope, memberId: await this.self(access) };
  }

  /** The live Visit if the viewer may see it; 404 otherwise. */
  private async visible(
    access: MemberAccess,
    load: (ws: string) => Promise<StoredVisit | null>,
  ): Promise<StoredVisit> {
    const visit = await load(access.workspaceId);
    if (visit == null || !isVisitVisible(visit, await this.ownScope(access)))
      throw visitNotFound();
    return visit;
  }

  private locked(access: MemberAccess, visit: StoredVisit): boolean {
    return isVisitLocked(visit, {
      userId: access.userId,
      viewAll: can(access, VISITS_MENU, "view_all"),
      now: this.clock(),
    });
  }

  actions(
    access: MemberAccess,
    visit: StoredVisit,
    /** For Check in and Check out: who is asking, today, the Visit's day. */
    check: { self: string | null; today: string; visitDate: string },
  ): VisitActions {
    const update = can(access, VISITS_MENU, "update");
    const isVisitor =
      check.self != null && visit.visitorIds.includes(check.self);
    const locked = this.locked(access, visit);
    const planned = visit.status === "planned";
    return {
      canUpdate: update && !locked && visit.status !== "cancelled",
      canComplete: update && planned,
      canCancel: update && planned,
      // A check-in belongs to its day; a checked-in Visit is completed instead.
      canReschedule: update && planned && visit.checkIn == null,
      canAddNote: update,
      canAddFiles: update,
      canCheckIn:
        update &&
        isVisitor &&
        visit.status === "planned" &&
        visit.checkIn == null &&
        check.visitDate === check.today,
      canCheckOut:
        update &&
        isVisitor &&
        visit.status !== "cancelled" &&
        visit.checkIn != null &&
        visit.checkOut == null &&
        check.visitDate === check.today,
      canDelete: can(access, VISITS_MENU, "delete") && !locked,
      locked,
    };
  }

  /**
   * The Visit form's choices and the list's filters: Visits read is
   * enough, so a read-only Role can filter too.
   */
  async formOptions(access: MemberAccess): Promise<VisitFormOptions> {
    assertCan(access, VISITS_MENU, "read");
    const [people, self, companies, timeZone] = await Promise.all([
      this.deps.team.people(access.workspaceId),
      this.self(access),
      can(access, COMPANIES_MENU, "read")
        ? this.companyScope(access).then((scope) =>
            this.deps.companyStore.pickable(
              this.deps.db,
              access.workspaceId,
              scope,
            ),
          )
        : Promise.resolve([]),
      this.deps.timeZone(access.workspaceId),
    ]);
    return {
      people: people.filter((person) => person.active),
      allPeople: people,
      selfMemberId: self,
      mustIncludeSelf: this.scope(access) != null,
      companies,
      canCreateCompany: can(access, COMPANIES_MENU, "create"),
      canAddContacts: can(access, COMPANIES_MENU, "update"),
      timeZone,
    };
  }

  async list(
    access: MemberAccess,
    params: {
      /** On or after this day, in the Company time zone. */
      from?: CalendarDate;
      /** Up to and including this day. */
      to?: CalendarDate;
      memberId?: string;
      prospectCompanyId?: string;
      statuses?: readonly VisitShownStatus[];
      purposes?: readonly VisitPurpose[];
      interests?: readonly Interest[];
      limit: number;
      after?: ListCursor;
    },
  ): Promise<{
    items: VisitListItem[];
    hasMore: boolean;
    total: number;
    timeZone: string;
  }> {
    assertCan(access, VISITS_MENU, "read");
    const now = this.clock();
    const timeZone = await this.deps.timeZone(access.workspaceId);
    const { from, to, ...filters } = params;
    const page = await this.deps.store.list(this.deps.db, {
      ...filters,
      from: from == null ? undefined : this.deps.dayStart(from, timeZone),
      to: to == null ? undefined : this.deps.dayStart(addDays(to, 1), timeZone),
      workspaceId: access.workspaceId,
      scope: await this.ownScope(access),
      now,
    });
    const names = await this.deps.team.memberNames(
      access.workspaceId,
      page.items.flatMap((row) => row.visitorIds),
    );
    const companyScope = await this.companyScope(access);
    return {
      ...page,
      timeZone,
      items: page.items.map((row) => ({
        id: row.id,
        number: row.number,
        prospectCompany: {
          id: row.prospectCompany.id,
          name: row.prospectCompany.name,
          canOpen:
            can(access, COMPANIES_MENU, "read") &&
            isProspectCompanyVisible(row.prospectCompany, companyScope),
        },
        visitAt: row.visitAt,
        status: shownStatus(row, now),
        purpose: row.purpose,
        interest: row.interest,
        outcome: row.outcome,
        visitors: row.visitorIds.map((id) => ({
          id,
          name: names.get(id) ?? "Removed member",
        })),
        contactNames: row.contactNames,
        checkedIn: row.checkedIn,
      })),
    };
  }

  private async companyScope(access: MemberAccess): Promise<OwnScope> {
    const scope = ownScope(access, COMPANIES_MENU);
    if (scope == null || scope.memberId != null) return scope;
    return { ...scope, memberId: await this.self(access) };
  }

  /** The Visit, if the viewer may see it, for routes that load first. */
  find(access: MemberAccess, id: string): Promise<StoredVisit> {
    return this.visible(access, (ws) =>
      this.deps.store.find(this.deps.db, ws, id),
    );
  }

  async get(access: MemberAccess, id: string): Promise<VisitReadModel> {
    assertCan(access, VISITS_MENU, "read");
    const { db, store, companyStore, team } = this.deps;
    const visit = await this.find(access, id);
    const ws = access.workspaceId;
    const [company, contacts, notes, files, events, timeZone, companyScope] =
      await Promise.all([
        companyStore.find(db, ws, visit.prospectCompanyId),
        companyStore.contacts(db, ws, visit.prospectCompanyId),
        store.notes(db, ws, [visit.id]),
        this.deps.fileStore.files(ws, [visit.id]),
        this.deps.history(ws, visit.id),
        this.deps.timeZone(ws),
        this.companyScope(access),
      ]);
    // A company is never deleted while it has Visits; a missing row means
    // the data changed under us.
    if (company == null) throw visitNotFound();
    const history = events.filter((event) => HISTORY_ACTIONS.has(event.action));
    const [members, users] = await Promise.all([
      team.memberNames(ws, visit.visitorIds),
      team.userNames(ws, [
        visit.createdBy,
        ...(visit.checkIn == null ? [] : [visit.checkIn.by]),
        ...(visit.checkOut == null ? [] : [visit.checkOut.by]),
        ...notes.map((note) => note.createdBy),
        ...files.map((file) => file.createdBy),
        ...history.map((event) => event.actorUserId),
      ]),
    ]);
    const met = contacts.filter((contact) =>
      visit.contactIds.includes(contact.id),
    );
    // A Contact removed since the Visit keeps its place by name.
    const removed = visit.contactIds.filter(
      (contactId) => !met.some((contact) => contact.id === contactId),
    );
    const removedNames = await companyStore.contactsByIds(db, ws, removed);
    const {
      purpose,
      location,
      discussion,
      outcome,
      interest,
      requirementWorkType,
      requirementValue,
      requirementStartMonth,
    } = visit;
    return {
      purpose,
      location,
      discussion,
      outcome,
      interest,
      requirementWorkType,
      requirementValue,
      requirementStartMonth,
      id: visit.id,
      number: visit.number,
      prospectCompany: {
        id: company.id,
        name: company.name,
        address: company.address,
        city: company.city,
        canOpen:
          can(access, COMPANIES_MENU, "read") &&
          isProspectCompanyVisible(company, companyScope),
      },
      visitAt: visit.visitAt,
      status: shownStatus(
        { ...visit, checkedIn: visit.checkIn != null },
        this.clock(),
      ),
      cancelReason: visit.cancelReason,
      completedAt: visit.completedAt,
      visitors: visit.visitorIds.map((memberId) => ({
        id: memberId,
        name: members.get(memberId) ?? "Removed member",
      })),
      contacts: [...met, ...removedNames].map((contact) => ({
        id: contact.id,
        name: contact.name,
        jobTitle: contact.jobTitle,
        mobile: contact.mobile,
      })),
      checkIn:
        visit.checkIn == null
          ? null
          : {
              ...visit.checkIn,
              byName: users.get(visit.checkIn.by) ?? "Unknown",
            },
      checkOut:
        visit.checkOut == null
          ? null
          : {
              ...visit.checkOut,
              byName: users.get(visit.checkOut.by) ?? "Unknown",
            },
      files: files.map((file) => ({
        id: file.id,
        fileName: file.fileName,
        contentType: file.contentType,
        bytes: file.bytes,
        viewable: VIEWABLE.has(file.contentType),
        hasThumbnail: file.thumbKey != null,
        caption: file.caption,
        createdByName: users.get(file.createdBy) ?? "Unknown",
        createdAt: file.createdAt,
        canChange:
          can(access, VISITS_MENU, "update") &&
          (file.createdBy === access.userId ||
            can(access, VISITS_MENU, "view_all")),
      })),
      notes: notes.map((note) => ({
        id: note.id,
        text: note.text,
        at: note.createdAt,
        byName: users.get(note.createdBy) ?? "Unknown",
      })),
      history: history
        .map((event): VisitHistoryItem => {
          const after = (event.after ?? {}) as Record<string, unknown>;
          const before = (event.before ?? {}) as Record<string, unknown>;
          return {
            id: event.id,
            action: event.action.slice(
              "visit.".length,
            ) as VisitHistoryItem["action"],
            at: event.occurredAt,
            byName: users.get(event.actorUserId) ?? "Unknown",
            from:
              event.action === "visit.rescheduled"
                ? dateOf(before["visitAt"])
                : null,
            to:
              event.action === "visit.rescheduled"
                ? dateOf(after["visitAt"])
                : null,
            reason:
              event.action === "visit.cancelled" &&
              typeof after["cancelReason"] === "string"
                ? after["cancelReason"]
                : null,
            fileName: fileNameOf(event),
          };
        })
        .reverse(),
      createdByName: users.get(visit.createdBy) ?? "Unknown",
      createdAt: visit.createdAt,
      updatedAt: visit.updatedAt,
      timeZone,
      actions: this.actions(access, visit, {
        self: await this.self(access),
        today: await this.deps.today(ws),
        visitDate: this.deps.dateIn(visit.visitAt, timeZone),
      }),
    };
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /**
   * The visitors as saved: the given ones (on create the creator, on an
   * edit the current ones, by default), each added one an active Marketing
   * Person; people already on the Visit may stay after they leave.
   */
  private async visitors(
    access: MemberAccess,
    given: readonly string[] | undefined,
    current: readonly string[],
  ): Promise<string[]> {
    const ids = visitorIds({
      // An edit that leaves them out keeps them.
      given: given ?? (current.length > 0 ? current : undefined),
      self: await this.self(access),
      scope: await this.ownScope(access),
    });
    const added = ids.filter((id) => !current.includes(id));
    if (added.length > 0) {
      const people = await this.deps.team.people(access.workspaceId);
      for (const id of added)
        if (!people.some((person) => person.id === id && person.active))
          throw marketingPersonNotFound("visitorIds");
    }
    return ids;
  }

  /**
   * The points of contact: the given ones (on an edit the current ones, by
   * default), plus the new ones, added to the company in this transaction.
   * Each added id is a live Contact of the company; one already on the
   * Visit may stay after it is removed from the company, and still counts.
   * New Contacts on an existing company need Companies update and a
   * company the caller sees (ADR CM-0040 §5); otherwise 404.
   */
  private async contacts(
    tx: MarketingTx,
    access: MemberAccess,
    company: { id: string; createdBy: string; assignedMemberId: string | null },
    input: VisitWriteInput,
    options: { newCompany: boolean; current: readonly string[] },
  ): Promise<string[]> {
    const ids = [...new Set(input.contactIds ?? options.current)];
    const added = ids.filter((id) => !options.current.includes(id));
    if (added.length > 0) {
      const live = await this.deps.companyStore.contacts(
        tx,
        access.workspaceId,
        company.id,
      );
      for (const id of added)
        if (!live.some((contact) => contact.id === id))
          throw invalidField(
            "VISIT_CONTACT_NOT_FOUND",
            "Choose a Contact of this Prospect Company.",
            "contactIds",
          );
    }
    const extra = input.newContacts ?? [];
    if (extra.length > 0 && !options.newCompany) {
      assertCan(access, COMPANIES_MENU, "read");
      assertCan(access, COMPANIES_MENU, "update");
      if (!isProspectCompanyVisible(company, await this.companyScope(access)))
        throw prospectCompanyNotFound();
    }
    for (const raw of extra)
      ids.push(
        await this.deps.companies.addContactInTx(
          tx,
          access,
          company.id,
          contactDetails(raw),
        ),
      );
    return ids;
  }

  /** The company named on a write, locked, so it cannot be deleted meanwhile. */
  private async lockCompany(
    tx: MarketingTx,
    workspaceId: string,
    companyId: string,
  ) {
    const company = await this.deps.companyStore.lock(
      tx,
      workspaceId,
      companyId,
    );
    // On a write any live company of the Company will do (ADR CM-0040 §5).
    if (company == null) throw prospectCompanyNotFound();
    return company;
  }

  async create(access: MemberAccess, input: CreateVisitInput): Promise<string> {
    assertCanWrite(access, "create");
    const details = visitDetails(input);
    const now = this.clock();
    const ws = access.workspaceId;
    const visitors = await this.visitors(access, input.visitorIds, []);
    const prepared =
      input.newProspectCompany == null
        ? null
        : await this.deps.companies.prepareCreate(
            access,
            input.newProspectCompany,
          );
    const existingId = input.prospectCompanyId ?? null;
    if (prepared == null && existingId == null)
      throw invalidField(
        "VISIT_COMPANY_REQUIRED",
        "Choose the Prospect Company, or add it.",
        "prospectCompanyId",
      );
    const timeZone = await this.deps.timeZone(ws);
    const date = this.deps.dateIn(input.visitAt, timeZone);
    if (input.status === "completed")
      (await this.deps.backdated(access))("create", date);
    const nextFollowUp =
      input.nextFollowUp == null
        ? null
        : await this.deps.followUps.prepare(access, input.nextFollowUp);
    const id = newId();
    try {
      await this.deps.db.$transaction(async (tx) => {
        const companyId =
          existingId ??
          (prepared == null
            ? ""
            : await this.deps.companies.createInTx(tx, access, prepared));
        const company = await this.lockCompany(tx, ws, companyId);
        const contactIds = await this.contacts(tx, access, company, input, {
          newCompany: prepared != null,
          current: [],
        });
        const completed = input.status === "completed";
        // Logged with a new company and its primary Contact, and no one
        // else named: that Contact is who was met.
        if (completed && prepared?.contact != null && contactIds.length === 0) {
          const primary = (
            await this.deps.companyStore.contacts(tx, ws, companyId)
          ).find((contact) => contact.isPrimary);
          if (primary != null) contactIds.push(primary.id);
        }
        if (completed)
          assertCompletable({
            visitAt: input.visitAt,
            now,
            contactCount: contactIds.length,
            discussion: details.discussion,
          });
        const row: VisitRow = {
          ...details,
          location: details.location ?? defaultLocation(company),
          prospectCompanyId: companyId,
          visitAt: input.visitAt,
          status: input.status,
          completedAt: completed ? now : null,
          completedBy: completed ? access.userId : null,
          cancelReason: null,
          cancelledAt: null,
          cancelledBy: null,
        };
        const allocated = await this.deps.nextNumber(tx, {
          workspaceId: ws,
          date,
          by: access.userId,
        });
        await this.deps.store.insert(tx, {
          ...row,
          id,
          workspaceId: ws,
          number: allocated.number,
          sequence: allocated.sequence,
          visitorIds: visitors,
          contactIds,
          by: access.userId,
          at: now,
        });
        if (completed)
          await this.deps.companies.markContactedInTx(tx, access, companyId);
        if (nextFollowUp != null)
          await this.deps.followUps.createInTx(tx, access, nextFollowUp, {
            prospectCompanyId: companyId,
            visitId: id,
          });
        await recordAudit(tx, {
          workspaceId: ws,
          actorUserId: access.userId,
          action: "visit.created",
          entityType: "marketing_visit",
          entityId: id,
          after: {
            number: allocated.number,
            ...snapshot({ ...row, visitorIds: visitors, contactIds }),
          },
          occurredAt: now,
        });
      });
    } catch (error) {
      throw mapUniqueViolation(error);
    }
    return id;
  }

  /**
   * Edits a Visit. A planned one moves to another time only by Reschedule
   * (400 `VISIT_RESCHEDULE_REQUIRED`); a Completed one keeps its rules: not
   * in the future, a point of contact and the Discussion, the back-dated
   * limit on its old and new date, and the lock.
   */
  async update(
    access: MemberAccess,
    id: string,
    input: VisitWriteInput & {
      prospectCompanyId: string;
      expectedUpdatedAt: Date;
    },
  ): Promise<void> {
    assertCanWrite(access, "update");
    const details = visitDetails(input);
    const now = this.clock();
    const ws = access.workspaceId;
    const timeZone = await this.deps.timeZone(ws);
    const check = await this.deps.backdated(access);
    await this.deps.db.$transaction(async (tx) => {
      const current = await this.visible(access, (w) =>
        this.deps.store.lock(tx, w, id),
      );
      if (!same(current.updatedAt, input.expectedUpdatedAt))
        throw visitChanged();
      if (current.status === "cancelled")
        throw conflict(
          "VISIT_CANCELLED",
          "A cancelled Visit cannot be changed. Notes can still be added.",
        );
      if (this.locked(access, current)) throw visitLocked();
      if (current.status === "planned" && !same(current.visitAt, input.visitAt))
        throw invalidField(
          "VISIT_RESCHEDULE_REQUIRED",
          "Reschedule the Visit to change its time.",
          "visitAt",
        );
      const visitors = await this.visitors(
        access,
        input.visitorIds,
        current.visitorIds,
      );
      const company = await this.lockCompany(tx, ws, input.prospectCompanyId);
      const contactIds = await this.contacts(tx, access, company, input, {
        newCompany: false,
        // The current Contacts stay only with the company they belong to.
        current:
          current.prospectCompanyId === input.prospectCompanyId
            ? current.contactIds
            : [],
      });
      if (current.status === "completed") {
        check("edit", this.deps.dateIn(current.visitAt, timeZone));
        if (!same(current.visitAt, input.visitAt))
          check("edit", this.deps.dateIn(input.visitAt, timeZone));
        assertCompletable({
          visitAt: input.visitAt,
          now,
          contactCount: contactIds.length,
          discussion: details.discussion,
        });
      }
      const patch: Partial<VisitRow> = {
        ...details,
        prospectCompanyId: input.prospectCompanyId,
        visitAt: input.visitAt,
      };
      await this.deps.store.update(
        tx,
        id,
        patch,
        { visitorIds: visitors, contactIds },
        access.userId,
        now,
      );
      if (
        current.status === "completed" &&
        current.prospectCompanyId !== input.prospectCompanyId
      )
        await this.deps.companies.markContactedInTx(
          tx,
          access,
          input.prospectCompanyId,
        );
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action: "visit.updated",
        entityType: "marketing_visit",
        entityId: id,
        before: snapshot(current),
        after: snapshot({
          ...current,
          ...patch,
          visitorIds: visitors,
          contactIds,
        }),
        occurredAt: now,
      });
    });
  }

  /**
   * Completes a planned Visit with what was found (ADR CM-0040 §7): the
   * time it happened (not in the future, within the back-dated limit), a
   * point of contact and the Discussion. The company moves from New to
   * Contacted in the same transaction.
   */
  async complete(
    access: MemberAccess,
    id: string,
    input: VisitWriteInput & { expectedUpdatedAt: Date },
  ): Promise<void> {
    assertCanWrite(access, "update");
    const details = visitDetails(input);
    const now = this.clock();
    const ws = access.workspaceId;
    const timeZone = await this.deps.timeZone(ws);
    (await this.deps.backdated(access))(
      "create",
      this.deps.dateIn(input.visitAt, timeZone),
    );
    const nextFollowUp =
      input.nextFollowUp == null
        ? null
        : await this.deps.followUps.prepare(access, input.nextFollowUp);
    await this.deps.db.$transaction(async (tx) => {
      const current = await this.visible(access, (w) =>
        this.deps.store.lock(tx, w, id),
      );
      if (!same(current.updatedAt, input.expectedUpdatedAt))
        throw visitChanged();
      assertPlanned(current.status, "completed");
      const visitors = await this.visitors(
        access,
        input.visitorIds,
        current.visitorIds,
      );
      const company = await this.lockCompany(tx, ws, current.prospectCompanyId);
      const contactIds = await this.contacts(tx, access, company, input, {
        newCompany: false,
        current: current.contactIds,
      });
      assertCompletable({
        visitAt: input.visitAt,
        now,
        contactCount: contactIds.length,
        discussion: details.discussion,
      });
      const patch: Partial<VisitRow> = {
        ...details,
        location: details.location ?? current.location,
        visitAt: input.visitAt,
        status: "completed",
        completedAt: now,
        completedBy: access.userId,
      };
      await this.deps.store.update(
        tx,
        id,
        patch,
        { visitorIds: visitors, contactIds },
        access.userId,
        now,
      );
      await this.deps.companies.markContactedInTx(
        tx,
        access,
        current.prospectCompanyId,
      );
      if (nextFollowUp != null)
        await this.deps.followUps.createInTx(tx, access, nextFollowUp, {
          prospectCompanyId: current.prospectCompanyId,
          visitId: id,
        });
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action: "visit.completed",
        entityType: "marketing_visit",
        entityId: id,
        before: snapshot(current),
        after: snapshot({
          ...current,
          ...patch,
          visitorIds: visitors,
          contactIds,
        }),
        occurredAt: now,
      });
    });
  }

  /** A planned Visit's new time; the old one stays in its history. */
  async reschedule(
    access: MemberAccess,
    id: string,
    input: { visitAt: Date; expectedUpdatedAt: Date },
  ): Promise<void> {
    assertCanWrite(access, "update");
    const now = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const current = await this.visible(access, (w) =>
        this.deps.store.lock(tx, w, id),
      );
      if (!same(current.updatedAt, input.expectedUpdatedAt))
        throw visitChanged();
      assertCanReschedule({
        status: current.status,
        checkedIn: current.checkIn != null,
      });
      if (same(current.visitAt, input.visitAt))
        throw invalidField(
          "VISIT_TIME_UNCHANGED",
          "Choose a different time.",
          "visitAt",
        );
      await this.deps.store.update(
        tx,
        id,
        { visitAt: input.visitAt },
        {},
        access.userId,
        now,
      );
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "visit.rescheduled",
        entityType: "marketing_visit",
        entityId: id,
        before: { visitAt: current.visitAt.toISOString() },
        after: { visitAt: input.visitAt.toISOString() },
        occurredAt: now,
      });
    });
  }

  async cancel(
    access: MemberAccess,
    id: string,
    input: { reason: string; expectedUpdatedAt: Date },
  ): Promise<void> {
    assertCanWrite(access, "update");
    const reason = cancelReason(input.reason);
    const now = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const current = await this.visible(access, (w) =>
        this.deps.store.lock(tx, w, id),
      );
      if (!same(current.updatedAt, input.expectedUpdatedAt))
        throw visitChanged();
      assertPlanned(current.status, "cancelled");
      await this.deps.store.update(
        tx,
        id,
        {
          status: "cancelled",
          cancelReason: reason,
          cancelledAt: now,
          cancelledBy: access.userId,
        },
        {},
        access.userId,
        now,
      );
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "visit.cancelled",
        entityType: "marketing_visit",
        entityId: id,
        before: { status: current.status },
        after: { status: "cancelled", cancelReason: reason },
        occurredAt: now,
      });
    });
  }

  /** A dated note, never edited (PRD §3.4); allowed past the lock. */
  async addNote(
    access: MemberAccess,
    id: string,
    input: { text: string },
  ): Promise<void> {
    assertCanWrite(access, "update");
    const text = noteText(input.text);
    const now = this.clock();
    const noteId = newId();
    await this.deps.db.$transaction(async (tx) => {
      const current = await this.visible(access, (w) =>
        this.deps.store.lock(tx, w, id),
      );
      await this.deps.store.addNote(tx, {
        id: noteId,
        workspaceId: access.workspaceId,
        visitId: current.id,
        text,
        createdAt: now,
        createdBy: access.userId,
      });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "visit.note_added",
        entityType: "marketing_visit",
        entityId: id,
        after: { noteId, text },
        occurredAt: now,
      });
    });
  }

  /** Best effort: a leftover object costs storage, and the orphan job takes it. */
  private async discard(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.deps.storage.delete(key);
      } catch (error) {
        console.error(`Could not delete ${key} from storage`, error);
      }
    }
  }

  /**
   * Check in (ADR CM-0040 §10): a visitor, on a Planned Visit dated today,
   * with one position or why there is none. Nothing is read in between.
   */
  async checkIn(
    access: MemberAccess,
    id: string,
    input: {
      position?: CheckPosition | null;
      location?: "refused" | "unavailable" | null;
    },
  ): Promise<void> {
    // One instant: the day check and the saved time.
    const at = this.clock();
    assertCanWrite(access, "update");
    const point = checkPoint(input);
    const ws = access.workspaceId;
    const [timeZone, self] = await Promise.all([
      this.deps.timeZone(ws),
      this.self(access),
    ]);
    const today = this.deps.dateIn(at, timeZone);
    await this.deps.db.$transaction(async (tx) => {
      const current = await this.visible(access, (w) =>
        this.deps.store.lock(tx, w, id),
      );
      assertCanCheckIn({
        status: current.status,
        checkedIn: current.checkIn != null,
        isVisitor: self != null && current.visitorIds.includes(self),
        visitDate: this.deps.dateIn(current.visitAt, timeZone),
        today,
      });
      await this.deps.store.setCheck(tx, id, "in", {
        ...point,
        at,
        by: access.userId,
      });
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action: "visit.checked_in",
        entityType: "marketing_visit",
        entityId: id,
        // The position stays on the Visit; the trail says only whether one was kept.
        after: { location: point.location },
        occurredAt: at,
      });
    });
  }

  /**
   * Check out: a visitor, after checking in, on the Visit's day; the same
   * single reading.
   */
  async checkOut(
    access: MemberAccess,
    id: string,
    input: {
      position?: CheckPosition | null;
      location?: "refused" | "unavailable" | null;
    },
  ): Promise<void> {
    const at = this.clock();
    assertCanWrite(access, "update");
    const point = checkPoint(input);
    const ws = access.workspaceId;
    const [timeZone, self] = await Promise.all([
      this.deps.timeZone(ws),
      this.self(access),
    ]);
    const today = this.deps.dateIn(at, timeZone);
    await this.deps.db.$transaction(async (tx) => {
      const current = await this.visible(access, (w) =>
        this.deps.store.lock(tx, w, id),
      );
      assertCanCheckOut({
        status: current.status,
        checkedIn: current.checkIn != null,
        checkedOut: current.checkOut != null,
        isVisitor: self != null && current.visitorIds.includes(self),
        visitDate: this.deps.dateIn(current.visitAt, timeZone),
        today,
      });
      await this.deps.store.setCheck(tx, id, "out", {
        ...point,
        at,
        by: access.userId,
      });
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action: "visit.checked_out",
        entityType: "marketing_visit",
        entityId: id,
        after: { location: point.location },
        occurredAt: at,
      });
    });
  }

  /**
   * A tombstone; a Completed Visit keeps its lock and back-dated limit. Its
   * live files are tombstoned in the same transaction and stop counting
   * towards storage; their objects are deleted after the commit.
   */
  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    assertCanWrite(access, "delete");
    const now = this.clock();
    const ws = access.workspaceId;
    const timeZone = await this.deps.timeZone(ws);
    const check = await this.deps.backdated(access);
    const removed = await this.deps.db.$transaction(async (tx) => {
      const current = await this.visible(access, (w) =>
        this.deps.store.lock(tx, w, id),
      );
      if (!same(current.updatedAt, expectedUpdatedAt)) throw visitChanged();
      if (this.locked(access, current)) throw visitLocked();
      if (current.status === "completed")
        check("edit", this.deps.dateIn(current.visitAt, timeZone));
      await this.deps.store.remove(tx, id, access.userId, now);
      const files = await this.deps.fileStore.removeFilesOfVisit(tx, {
        workspaceId: ws,
        visitId: id,
        by: access.userId,
        now,
      });
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action: "visit.deleted",
        entityType: "marketing_visit",
        entityId: id,
        before: {
          number: current.number,
          ...snapshot(current),
          fileIds: files.map((file) => file.id),
        },
        occurredAt: now,
      });
      return files;
    });
    await this.discard(
      removed.flatMap((file) =>
        file.thumbKey == null ? [file.fileKey] : [file.fileKey, file.thumbKey],
      ),
    );
  }
}

/** The Prospect Company's address, the Location a Visit starts with (PRD §3.4). */
function defaultLocation(
  company: { address: string | null; city: string | null } | null,
): string | null {
  if (company == null) return null;
  const parts = [company.address, company.city].filter(
    (part): part is string => part != null && part !== "",
  );
  return parts.length === 0 ? null : parts.join(", ").slice(0, 300);
}

export type { VisitStatus };
