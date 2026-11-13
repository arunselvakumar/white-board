import {
  assertCan,
  can,
  ownScope,
  type MemberAccess,
  type MenuKey,
  type OwnScope,
} from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { conflict, notFound } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import {
  invalidField,
  marketingPersonNotFound,
  prospectCompanyNotFound,
} from "../domain/marketing-errors";
import type {
  FollowUpDue,
  FollowUpStatus,
  FollowUpType,
} from "../domain/marketing-terms";
import {
  assertOpen,
  followUpDetails,
  followUpDone,
  followUpDue,
  isFollowUpVisible,
  type FollowUpDetails,
  type FollowUpDetailsInput,
} from "../domain/follow-up";
import { isProspectCompanyVisible } from "../domain/prospect-company";
import { isVisitVisible } from "../domain/visit";
import type {
  FollowUpRow,
  FollowUpStore,
  MarketingDb,
  MarketingPerson,
  MarketingTeam,
  MarketingTx,
  ProspectCompanyStore,
  StoredFollowUp,
  VisitStore,
} from "./ports";

export const FOLLOW_UPS_MENU = "marketing.follow_ups";
const COMPANIES_MENU = "marketing.companies";
const VISITS_MENU = "marketing.visits";

export type FollowUpDeps = {
  db: MarketingDb;
  store: FollowUpStore;
  companyStore: ProspectCompanyStore;
  visitStore: VisitStore;
  team: MarketingTeam;
  today: (workspaceId: string) => Promise<CalendarDate>;
  timeZone: (workspaceId: string) => Promise<string>;
  clock?: () => Date;
};

export type FollowUpInput = FollowUpDetailsInput & {
  /** An active Marketing Person; the creator when left out. */
  ownerMemberId?: string;
};

export type CreateFollowUpInput = FollowUpInput & {
  prospectCompanyId: string;
  /** A Visit of that company the caller can see. */
  visitId?: string | null;
};

/** A Follow-up checked and ready for its transaction. */
export type PreparedFollowUp = FollowUpDetails & { ownerMemberId: string };

export type FollowUpActions = {
  /** Change the type, due date, owner and note while Open. */
  canUpdate: boolean;
  /** Mark Done, or cancel, while Open. */
  canClose: boolean;
  canDelete: boolean;
};

export type FollowUpReadModel = {
  id: string;
  prospectCompany: { id: string; name: string; canOpen: boolean };
  visit: { id: string; number: string; canOpen: boolean } | null;
  type: FollowUpType;
  dueDate: CalendarDate;
  /** Overdue, Today or Upcoming while Open. */
  due: FollowUpDue | null;
  owner: { id: string; name: string };
  note: string | null;
  status: FollowUpStatus;
  resultNote: string | null;
  doneOn: CalendarDate | null;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  actions: FollowUpActions;
};

export type FollowUpFormOptions = {
  /** Active Marketing People: the ones a Follow-up can be given to. */
  people: MarketingPerson[];
  /** Inactive ones too, whose Follow-ups remain: the list's owner filter. */
  allPeople: MarketingPerson[];
  selfMemberId: string | null;
  /** The Prospect Companies the caller can pick, A–Z. */
  companies: { id: string; name: string }[];
  /** The Company's today, for the due groups. */
  today: CalendarDate;
  /** With View all, the list can show everyone's. */
  canSeeAll: boolean;
};

function followUpNotFound() {
  return notFound("FOLLOW_UP_NOT_FOUND", "This Follow-up was not found.");
}

function followUpChanged() {
  return conflict(
    "FOLLOW_UP_CHANGED",
    "Someone else changed this Follow-up. Reload it and try again.",
  );
}

const same = (a: Date, b: Date) => a.getTime() === b.getTime();

function snapshot(row: Partial<FollowUpRow>) {
  return {
    prospectCompanyId: row.prospectCompanyId,
    visitId: row.visitId,
    type: row.type,
    dueDate: row.dueDate,
    ownerMemberId: row.ownerMemberId,
    note: row.note,
    status: row.status,
    resultNote: row.resultNote,
    doneOn: row.doneOn,
  };
}

/**
 * Follow-ups (PRD §3.5, ADR CM-0040 §5, §8): what is owed after a Visit,
 * with an owner and a due date. Without View all a member sees and changes
 * only the Follow-ups they created or own; any other answers 404. They may
 * give one to a colleague and keep seeing it as its creator. Every write
 * is one transaction with the row lock and its audit event.
 */
export class FollowUpHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: FollowUpDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  private async self(access: MemberAccess): Promise<string | null> {
    return (
      access.memberId ??
      (await this.deps.team.memberOfUser(access.workspaceId, access.userId))
    );
  }

  /** The caller's scope on a menu, with their member id for the Owner too. */
  private async scopeOf(
    access: MemberAccess,
    menu: MenuKey,
  ): Promise<OwnScope> {
    const scope = ownScope(access, menu);
    if (scope == null || scope.memberId != null) return scope;
    return { ...scope, memberId: await this.self(access) };
  }

  actions(access: MemberAccess, followUp: StoredFollowUp): FollowUpActions {
    const open = followUp.status === "open";
    const update = can(access, FOLLOW_UPS_MENU, "update");
    return {
      canUpdate: update && open,
      canClose: update && open,
      canDelete: can(access, FOLLOW_UPS_MENU, "delete"),
    };
  }

  private async visible(
    access: MemberAccess,
    load: (ws: string) => Promise<StoredFollowUp | null>,
  ): Promise<StoredFollowUp> {
    const followUp = await load(access.workspaceId);
    if (
      followUp == null ||
      !isFollowUpVisible(followUp, await this.scopeOf(access, FOLLOW_UPS_MENU))
    )
      throw followUpNotFound();
    return followUp;
  }

  async formOptions(access: MemberAccess): Promise<FollowUpFormOptions> {
    assertCan(access, FOLLOW_UPS_MENU, "read");
    const [people, self, companies, today] = await Promise.all([
      this.deps.team.people(access.workspaceId),
      this.self(access),
      can(access, COMPANIES_MENU, "read")
        ? this.scopeOf(access, COMPANIES_MENU).then((scope) =>
            this.deps.companyStore.pickable(
              this.deps.db,
              access.workspaceId,
              scope,
            ),
          )
        : Promise.resolve([]),
      this.deps.today(access.workspaceId),
    ]);
    return {
      people: people.filter((person) => person.active),
      allPeople: people,
      selfMemberId: self,
      companies: companies.map(({ id, name }) => ({ id, name })),
      today,
      canSeeAll: can(access, FOLLOW_UPS_MENU, "view_all"),
    };
  }

  async list(
    access: MemberAccess,
    params: {
      /** Only those the caller owns (the list opens on Mine). */
      mine?: boolean;
      ownerMemberId?: string;
      statuses?: readonly FollowUpStatus[];
      prospectCompanyId?: string;
      visitId?: string;
      limit: number;
      after?: { dueDate: CalendarDate; id: string };
    },
  ): Promise<{
    items: FollowUpReadModel[];
    hasMore: boolean;
    total: number;
    today: CalendarDate;
  }> {
    assertCan(access, FOLLOW_UPS_MENU, "read");
    const ws = access.workspaceId;
    const self = await this.self(access);
    const { mine, ...filters } = params;
    if (mine === true && self == null)
      return {
        items: [],
        hasMore: false,
        total: 0,
        today: await this.deps.today(ws),
      };
    const [page, today, companyScope, visitScope] = await Promise.all([
      this.deps.store.list(this.deps.db, {
        ...filters,
        ownerMemberId:
          mine === true ? (self ?? undefined) : filters.ownerMemberId,
        workspaceId: ws,
        scope: await this.scopeOf(access, FOLLOW_UPS_MENU),
      }),
      this.deps.today(ws),
      this.scopeOf(access, COMPANIES_MENU),
      this.scopeOf(access, VISITS_MENU),
    ]);
    const [members, users] = await Promise.all([
      this.deps.team.memberNames(
        ws,
        page.items.map((row) => row.ownerMemberId),
      ),
      this.deps.team.userNames(
        ws,
        page.items.map((row) => row.createdBy),
      ),
    ]);
    // A Visit link opens only for a Visit the caller can see.
    const visits = await Promise.all(
      page.items.map((row) =>
        row.visitId == null
          ? Promise.resolve(null)
          : this.deps.visitStore.find(this.deps.db, ws, row.visitId),
      ),
    );
    return {
      hasMore: page.hasMore,
      total: page.total,
      today,
      items: page.items.map((row, index) => {
        const visit = visits[index];
        return this.readModel(access, row, {
          companyName: row.prospectCompany.name,
          canOpenCompany:
            can(access, COMPANIES_MENU, "read") &&
            isProspectCompanyVisible(row.prospectCompany, companyScope),
          visit:
            row.visit == null
              ? null
              : {
                  ...row.visit,
                  canOpen:
                    visit != null &&
                    can(access, VISITS_MENU, "read") &&
                    isVisitVisible(visit, visitScope),
                },
          today,
          members,
          users,
        });
      }),
    };
  }

  private readModel(
    access: MemberAccess,
    row: StoredFollowUp,
    context: {
      companyName: string;
      canOpenCompany: boolean;
      visit: FollowUpReadModel["visit"];
      today: CalendarDate;
      members: ReadonlyMap<string, string>;
      users: ReadonlyMap<string, string>;
    },
  ): FollowUpReadModel {
    return {
      id: row.id,
      prospectCompany: {
        id: row.prospectCompanyId,
        name: context.companyName,
        canOpen: context.canOpenCompany,
      },
      visit: context.visit,
      type: row.type,
      dueDate: row.dueDate,
      due: followUpDue(row, context.today),
      owner: {
        id: row.ownerMemberId,
        name: context.members.get(row.ownerMemberId) ?? "Removed member",
      },
      note: row.note,
      status: row.status,
      resultNote: row.resultNote,
      doneOn: row.doneOn,
      createdByName: context.users.get(row.createdBy) ?? "Unknown",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      actions: this.actions(access, row),
    };
  }

  /** The Follow-up if the viewer may see it, for routes that load first. */
  find(access: MemberAccess, id: string): Promise<StoredFollowUp> {
    return this.visible(access, (ws) =>
      this.deps.store.find(this.deps.db, ws, id),
    );
  }

  async get(access: MemberAccess, id: string): Promise<FollowUpReadModel> {
    assertCan(access, FOLLOW_UPS_MENU, "read");
    const ws = access.workspaceId;
    const row = await this.find(access, id);
    const [company, visit, today, companyScope, visitScope, members, users] =
      await Promise.all([
        this.deps.companyStore.find(this.deps.db, ws, row.prospectCompanyId),
        row.visitId == null
          ? Promise.resolve(null)
          : this.deps.visitStore.find(this.deps.db, ws, row.visitId),
        this.deps.today(ws),
        this.scopeOf(access, COMPANIES_MENU),
        this.scopeOf(access, VISITS_MENU),
        this.deps.team.memberNames(ws, [row.ownerMemberId]),
        this.deps.team.userNames(ws, [row.createdBy]),
      ]);
    if (company == null) throw followUpNotFound();
    return this.readModel(access, row, {
      companyName: company.name,
      canOpenCompany:
        can(access, COMPANIES_MENU, "read") &&
        isProspectCompanyVisible(company, companyScope),
      visit:
        visit == null
          ? null
          : {
              id: visit.id,
              number: visit.number,
              canOpen:
                can(access, VISITS_MENU, "read") &&
                isVisitVisible(visit, visitScope),
            },
      today,
      members,
      users,
    });
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /** The owner: the given active Marketing Person, or the caller. */
  private async owner(
    access: MemberAccess,
    given: string | undefined,
    current: string | null,
  ): Promise<string> {
    const id = given ?? current ?? (await this.self(access));
    if (id == null) throw marketingPersonNotFound("ownerMemberId");
    if (id === current) return id;
    const people = await this.deps.team.people(access.workspaceId);
    if (!people.some((person) => person.id === id && person.active))
      throw marketingPersonNotFound("ownerMemberId");
    return id;
  }

  /**
   * Checks a new Follow-up before its transaction: Follow-ups create, the
   * fields and the owner. A Visit's Next Follow-up uses it too (PRD §3.4).
   */
  async prepare(
    access: MemberAccess,
    input: FollowUpInput,
  ): Promise<PreparedFollowUp> {
    assertCan(access, FOLLOW_UPS_MENU, "create");
    return {
      ...followUpDetails(input),
      ownerMemberId: await this.owner(access, input.ownerMemberId, null),
    };
  }

  /** Adds a prepared Follow-up inside the caller's transaction. */
  async createInTx(
    tx: MarketingTx,
    access: MemberAccess,
    prepared: PreparedFollowUp,
    target: { prospectCompanyId: string; visitId: string | null },
  ): Promise<string> {
    const id = newId();
    const at = this.clock();
    const row: FollowUpRow = {
      ...prepared,
      ...target,
      status: "open",
      resultNote: null,
      doneOn: null,
      doneAt: null,
      doneBy: null,
      cancelledAt: null,
      cancelledBy: null,
      dueNotifiedOn: null,
      overdueNotifiedAt: null,
    };
    await this.deps.store.insert(tx, {
      ...row,
      id,
      workspaceId: access.workspaceId,
      by: access.userId,
      at,
    });
    await recordAudit(tx, {
      workspaceId: access.workspaceId,
      actorUserId: access.userId,
      action: "follow_up.created",
      entityType: "marketing_follow_up",
      entityId: id,
      after: snapshot(row),
      occurredAt: at,
    });
    return id;
  }

  async create(
    access: MemberAccess,
    input: CreateFollowUpInput,
  ): Promise<string> {
    const prepared = await this.prepare(access, input);
    const ws = access.workspaceId;
    const visitScope = await this.scopeOf(access, VISITS_MENU);
    return this.deps.db.$transaction(async (tx) => {
      // On a write any live company of the Company will do (ADR CM-0040 §5).
      const company = await this.deps.companyStore.lock(
        tx,
        ws,
        input.prospectCompanyId,
      );
      if (company == null) throw prospectCompanyNotFound();
      const visitId = input.visitId ?? null;
      if (visitId != null) {
        const visit = await this.deps.visitStore.find(tx, ws, visitId);
        if (
          visit?.prospectCompanyId !== company.id ||
          !isVisitVisible(visit, visitScope)
        )
          throw invalidField(
            "FOLLOW_UP_VISIT_NOT_FOUND",
            "Choose a Visit to this Prospect Company.",
            "visitId",
          );
      }
      return this.createInTx(tx, access, prepared, {
        prospectCompanyId: company.id,
        visitId,
      });
    });
  }

  /**
   * Changes an Open one; a new due date or a new owner clears both
   * reminder marks, so the new day or the new owner is told (ADR CM-0040 §8).
   */
  async update(
    access: MemberAccess,
    id: string,
    input: FollowUpInput & { expectedUpdatedAt: Date },
  ): Promise<void> {
    assertCan(access, FOLLOW_UPS_MENU, "update");
    const details = followUpDetails(input);
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const current = await this.visible(access, (ws) =>
        this.deps.store.lock(tx, ws, id),
      );
      if (!same(current.updatedAt, input.expectedUpdatedAt))
        throw followUpChanged();
      assertOpen(current.status, "changed");
      const ownerMemberId = await this.owner(
        access,
        input.ownerMemberId,
        current.ownerMemberId,
      );
      const patch: Partial<FollowUpRow> = {
        ...details,
        ownerMemberId,
        ...(details.dueDate === current.dueDate &&
        ownerMemberId === current.ownerMemberId
          ? {}
          : { dueNotifiedOn: null, overdueNotifiedAt: null }),
      };
      await this.deps.store.update(tx, id, patch, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "follow_up.updated",
        entityType: "marketing_follow_up",
        entityId: id,
        before: snapshot(current),
        after: snapshot({ ...current, ...patch }),
        occurredAt: at,
      });
    });
  }

  async done(
    access: MemberAccess,
    id: string,
    input: {
      resultNote?: string | null;
      doneOn?: string | null;
      expectedUpdatedAt: Date;
    },
  ): Promise<void> {
    assertCan(access, FOLLOW_UPS_MENU, "update");
    const today = await this.deps.today(access.workspaceId);
    const done = followUpDone(input, today);
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const current = await this.visible(access, (ws) =>
        this.deps.store.lock(tx, ws, id),
      );
      if (!same(current.updatedAt, input.expectedUpdatedAt))
        throw followUpChanged();
      assertOpen(current.status, "marked done");
      const patch: Partial<FollowUpRow> = {
        status: "done",
        resultNote: done.resultNote,
        doneOn: done.doneOn,
        doneAt: at,
        doneBy: access.userId,
      };
      await this.deps.store.update(tx, id, patch, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "follow_up.done",
        entityType: "marketing_follow_up",
        entityId: id,
        before: { status: current.status },
        after: {
          status: "done",
          resultNote: done.resultNote,
          doneOn: done.doneOn,
        },
        occurredAt: at,
      });
    });
  }

  async cancel(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    assertCan(access, FOLLOW_UPS_MENU, "update");
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const current = await this.visible(access, (ws) =>
        this.deps.store.lock(tx, ws, id),
      );
      if (!same(current.updatedAt, expectedUpdatedAt)) throw followUpChanged();
      assertOpen(current.status, "cancelled");
      await this.deps.store.update(
        tx,
        id,
        { status: "cancelled", cancelledAt: at, cancelledBy: access.userId },
        access.userId,
        at,
      );
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "follow_up.cancelled",
        entityType: "marketing_follow_up",
        entityId: id,
        before: { status: current.status },
        after: { status: "cancelled" },
        occurredAt: at,
      });
    });
  }

  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    assertCan(access, FOLLOW_UPS_MENU, "delete");
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const current = await this.visible(access, (ws) =>
        this.deps.store.lock(tx, ws, id),
      );
      if (!same(current.updatedAt, expectedUpdatedAt)) throw followUpChanged();
      await this.deps.store.remove(tx, id, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "follow_up.deleted",
        entityType: "marketing_follow_up",
        entityId: id,
        before: snapshot(current),
        occurredAt: at,
      });
    });
  }
}
