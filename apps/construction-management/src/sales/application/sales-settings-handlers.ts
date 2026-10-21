import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import { newId } from "@/src/shared-kernel/ids";

import {
  funnelStageInUse,
  funnelStageLast,
  movedStageOrder,
  salesListChanged,
  salesListName,
  salesListNameInUse,
  salesListNotFound,
  salesPickInUse,
  type SalesListKind,
  type SalesPickList,
  type StageMove,
} from "../domain/sales-lists";
import type { SalesTx } from "./ports";

const MENU = "sales.inquiries";

// ---------------------------------------------------------------------------
// The store port (Prisma in `infrastructure/sales-list-store`)
// ---------------------------------------------------------------------------

/** A row of `funnel_stages`, `lead_sources` or `lost_reasons`. */
export type StoredSalesListItem = {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  isSeed: boolean;
  /** Always true for stages, which are never disabled. */
  isActive: boolean;
  /** Funnel order, 1…n; 0 for the other lists. */
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  /** Set on a deleted row (`byIds` returns those too). */
  deletedAt: Date | null;
};

export type SalesListStore = {
  /** Live rows: stages in funnel order, the others by name. */
  list(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
    kind: SalesListKind,
  ): Promise<StoredSalesListItem[]>;
  /** A live row of the Company, or null. */
  find(
    db: SalesTx,
    workspaceId: string,
    kind: SalesListKind,
    id: string,
  ): Promise<StoredSalesListItem | null>;
  /** Rows by id, deleted ones included (for names on old inquiries). */
  byIds(
    db: SalesTx,
    workspaceId: string,
    kind: SalesListKind,
    ids: readonly string[],
  ): Promise<Map<string, StoredSalesListItem>>;
  /**
   * Locks these rows `FOR SHARE` (a Settings change of them waits) and
   * reads them, deleted ones included (an inquiry write's picks).
   */
  share(
    db: SalesTx,
    workspaceId: string,
    kind: SalesListKind,
    ids: readonly string[],
  ): Promise<Map<string, StoredSalesListItem>>;
  /** Locks the Project's live rows of the list `FOR UPDATE` and reads them. */
  lockProject(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
    kind: SalesListKind,
  ): Promise<StoredSalesListItem[]>;
  /** Whether another live row of the Project has this name, any case. */
  nameTaken(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
    kind: SalesListKind,
    name: string,
    exceptId?: string,
  ): Promise<boolean>;
  /** 409 `<KIND>_NAME_IN_USE` when the unique index refuses it (a race). */
  insert(
    db: SalesTx,
    kind: SalesListKind,
    row: {
      id: string;
      workspaceId: string;
      projectId: string;
      name: string;
      sortOrder: number;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  rename(
    db: SalesTx,
    kind: SalesListKind,
    id: string,
    name: string,
    by: string,
    at: Date,
  ): Promise<void>;
  setActive(
    db: SalesTx,
    kind: SalesPickList,
    id: string,
    active: boolean,
    by: string,
    at: Date,
  ): Promise<void>;
  /** Renumbers the stages 1…n in this order. */
  setStageOrder(
    db: SalesTx,
    ids: readonly string[],
    by: string,
    at: Date,
  ): Promise<void>;
  tombstone(
    db: SalesTx,
    kind: SalesListKind,
    id: string,
    by: string,
    at: Date,
  ): Promise<void>;
  /**
   * What uses each row of the Project, by id: Open inquiries in a stage;
   * live inquiries naming a Lead Source or Lost Reason.
   */
  usage(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
    kind: SalesListKind,
    ids?: readonly string[],
  ): Promise<Map<string, number>>;
};

export type SalesSettingsDeps = {
  db: SalesTx & {
    $transaction<T>(fn: (tx: SalesTx) => Promise<T>): Promise<T>;
  };
  store: SalesListStore;
  clock?: () => Date;
};

export type SalesListItem = StoredSalesListItem & {
  /** Open inquiries in a stage; live inquiries using a source or reason. */
  usage: number;
};

export type SalesSettings = {
  funnelStages: SalesListItem[];
  leadSources: SalesListItem[];
  lostReasons: SalesListItem[];
  /** Inquiry Update: add, rename, move, disable and delete. */
  canManage: boolean;
};

const ENTITY: Record<SalesListKind, string> = {
  funnel_stage: "sales_funnel_stage",
  lead_source: "sales_lead_source",
  lost_reason: "sales_lost_reason",
};

/**
 * Sales settings (CM-1002, ADR CM-0022 §2): a Project's Funnel Stages,
 * Lead Sources and Lost Reasons. Reading them needs Inquiry Read; every
 * change needs Inquiry Update on the Project, runs in one transaction that
 * locks the Project's rows of the list, and is audited. Names are unique
 * among live rows, ignoring case.
 */
export class SalesSettingsHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: SalesSettingsDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  private async withUsage(
    workspaceId: string,
    projectId: string,
    kind: SalesListKind,
  ): Promise<SalesListItem[]> {
    const { db, store } = this.deps;
    const [rows, usage] = await Promise.all([
      store.list(db, workspaceId, projectId, kind),
      store.usage(db, workspaceId, projectId, kind),
    ]);
    return rows.map((row) => ({ ...row, usage: usage.get(row.id) ?? 0 }));
  }

  /** The three lists with what uses each row. */
  async settings(
    access: MemberAccess,
    projectId: string,
  ): Promise<SalesSettings> {
    assertCan(access, MENU, "read", { projectId });
    const ws = access.workspaceId;
    const [funnelStages, leadSources, lostReasons] = await Promise.all([
      this.withUsage(ws, projectId, "funnel_stage"),
      this.withUsage(ws, projectId, "lead_source"),
      this.withUsage(ws, projectId, "lost_reason"),
    ]);
    return {
      funnelStages,
      leadSources,
      lostReasons,
      canManage: can(access, MENU, "update", { projectId }),
    };
  }

  /** A live row of the Company (404 `<KIND>_NOT_FOUND` otherwise). */
  async find(
    workspaceId: string,
    kind: SalesListKind,
    id: string,
  ): Promise<StoredSalesListItem> {
    const row = await this.deps.store.find(this.deps.db, workspaceId, kind, id);
    if (row == null) throw salesListNotFound(kind);
    return row;
  }

  private async item(
    workspaceId: string,
    kind: SalesListKind,
    id: string,
  ): Promise<SalesListItem> {
    const row = await this.find(workspaceId, kind, id);
    const usage = await this.deps.store.usage(
      this.deps.db,
      workspaceId,
      row.projectId,
      kind,
      [id],
    );
    return { ...row, usage: usage.get(id) ?? 0 };
  }

  /** Adds a row; a new stage goes last in the funnel. */
  async create(
    access: MemberAccess,
    kind: SalesListKind,
    projectId: string,
    rawName: string,
  ): Promise<SalesListItem> {
    assertCan(access, MENU, "update", { projectId });
    const name = salesListName(kind, rawName);
    const { db, store } = this.deps;
    const id = newId();
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const rows = await store.lockProject(
        tx,
        access.workspaceId,
        projectId,
        kind,
      );
      if (await store.nameTaken(tx, access.workspaceId, projectId, kind, name))
        throw salesListNameInUse(kind);
      const sortOrder =
        kind === "funnel_stage"
          ? rows.reduce((max, row) => Math.max(max, row.sortOrder), 0) + 1
          : 0;
      await store.insert(tx, kind, {
        id,
        workspaceId: access.workspaceId,
        projectId,
        name,
        sortOrder,
        by: access.userId,
        at,
      });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: `${ENTITY[kind]}.created`,
        entityType: ENTITY[kind],
        entityId: id,
        after: { projectId, name, sortOrder },
        occurredAt: at,
      });
    });
    return this.item(access.workspaceId, kind, id);
  }

  /** Renames a row (seeds too). 409 `<KIND>_CHANGED` when `expectedUpdatedAt` is stale. */
  async rename(
    access: MemberAccess,
    kind: SalesListKind,
    id: string,
    rawName: string,
    expectedUpdatedAt: Date,
  ): Promise<SalesListItem> {
    const current = await this.find(access.workspaceId, kind, id);
    assertCan(access, MENU, "update", { projectId: current.projectId });
    const name = salesListName(kind, rawName);
    const { db, store } = this.deps;
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const rows = await store.lockProject(
        tx,
        access.workspaceId,
        current.projectId,
        kind,
      );
      const row = rows.find((candidate) => candidate.id === id);
      if (row == null) throw salesListNotFound(kind);
      if (row.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        throw salesListChanged(kind, row.updatedAt);
      if (row.name === name) return;
      if (
        await store.nameTaken(
          tx,
          access.workspaceId,
          row.projectId,
          kind,
          name,
          id,
        )
      )
        throw salesListNameInUse(kind);
      await store.rename(tx, kind, id, name, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: `${ENTITY[kind]}.renamed`,
        entityType: ENTITY[kind],
        entityId: id,
        before: { name: row.name },
        after: { name },
        occurredAt: at,
      });
    });
    return this.item(access.workspaceId, kind, id);
  }

  /** Disables (leaves the pickers) or enables a Lead Source or Lost Reason. */
  async setActive(
    access: MemberAccess,
    kind: SalesPickList,
    id: string,
    active: boolean,
  ): Promise<SalesListItem> {
    const current = await this.find(access.workspaceId, kind, id);
    assertCan(access, MENU, "update", { projectId: current.projectId });
    const { db, store } = this.deps;
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const rows = await store.lockProject(
        tx,
        access.workspaceId,
        current.projectId,
        kind,
      );
      const row = rows.find((candidate) => candidate.id === id);
      if (row == null) throw salesListNotFound(kind);
      if (row.isActive === active) return;
      await store.setActive(tx, kind, id, active, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: `${ENTITY[kind]}.${active ? "enabled" : "disabled"}`,
        entityType: ENTITY[kind],
        entityId: id,
        before: { isActive: row.isActive },
        after: { isActive: active },
        occurredAt: at,
      });
    });
    return this.item(access.workspaceId, kind, id);
  }

  /**
   * Moves a stage one place up or down the funnel and renumbers the
   * Project's stages 1…n. At the top (up) or bottom (down) nothing changes.
   * Returns the stages in their new order.
   */
  async moveStage(
    access: MemberAccess,
    id: string,
    direction: StageMove,
  ): Promise<SalesListItem[]> {
    const current = await this.find(access.workspaceId, "funnel_stage", id);
    assertCan(access, MENU, "update", { projectId: current.projectId });
    const { db, store } = this.deps;
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const rows = await store.lockProject(
        tx,
        access.workspaceId,
        current.projectId,
        "funnel_stage",
      );
      const order = [...rows]
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
        .map((row) => row.id);
      if (!order.includes(id)) throw salesListNotFound("funnel_stage");
      const next = movedStageOrder(order, id, direction);
      if (next == null) return;
      await store.setStageOrder(tx, next, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "sales_funnel_stage.moved",
        entityType: ENTITY.funnel_stage,
        entityId: id,
        before: { order },
        after: { order: next, direction },
        occurredAt: at,
      });
    });
    return this.withUsage(
      access.workspaceId,
      current.projectId,
      "funnel_stage",
    );
  }

  /**
   * Deletes a row (a tombstone; old inquiries keep its name). A stage: 409
   * `FUNNEL_STAGE_IN_USE` while Open inquiries sit in it, 409
   * `FUNNEL_STAGE_LAST` for the Project's only one. A Lead Source or Lost
   * Reason: 409 `<KIND>_IN_USE` while any live inquiry names it.
   */
  async delete(
    access: MemberAccess,
    kind: SalesListKind,
    id: string,
  ): Promise<void> {
    const current = await this.find(access.workspaceId, kind, id);
    assertCan(access, MENU, "update", { projectId: current.projectId });
    const { db, store } = this.deps;
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const rows = await store.lockProject(
        tx,
        access.workspaceId,
        current.projectId,
        kind,
      );
      const row = rows.find((candidate) => candidate.id === id);
      if (row == null) throw salesListNotFound(kind);
      const used =
        (
          await store.usage(tx, access.workspaceId, row.projectId, kind, [id])
        ).get(id) ?? 0;
      if (kind === "funnel_stage") {
        if (used > 0) throw funnelStageInUse(used);
        if (rows.length <= 1) throw funnelStageLast();
      } else if (used > 0) throw salesPickInUse(kind, used);
      await store.tombstone(tx, kind, id, access.userId, at);
      if (kind === "funnel_stage")
        await store.setStageOrder(
          tx,
          [...rows]
            .filter((other) => other.id !== id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((other) => other.id),
          access.userId,
          at,
        );
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: `${ENTITY[kind]}.deleted`,
        entityType: ENTITY[kind],
        entityId: id,
        before: { projectId: row.projectId, name: row.name },
        occurredAt: at,
      });
    });
  }
}
