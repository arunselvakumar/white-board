import {
  cleanMasterName,
  masterChanged,
  masterInUse,
  masterNotFound,
  type TrackingMasterKind,
} from "../domain/master-kind";
import {
  assertDisableable,
  newTrackingMaster,
  trackingMasterSnapshot,
  type TrackingMaster,
} from "../domain/tracking-master";
import type { MasterChange } from "./ports";

/**
 * `construction_masters.issue_categories` and `tags`. Every write is one
 * transaction with its audit event; a live name taken (any case) is 409
 * `<KIND>_NAME_IN_USE`.
 */
export type TrackingMasterStore = {
  /** Live rows, by name. */
  list(
    kind: TrackingMasterKind,
    workspaceId: string,
  ): Promise<TrackingMaster[]>;
  find(
    kind: TrackingMasterKind,
    workspaceId: string,
    id: string,
  ): Promise<TrackingMaster | null>;
  /** The live row of this name (any case), or null. */
  findByName(
    kind: TrackingMasterKind,
    workspaceId: string,
    name: string,
  ): Promise<TrackingMaster | null>;
  insert(row: TrackingMaster, change: MasterChange): Promise<void>;
  /** Compare-and-set on `updatedAt`; 409 `<KIND>_CHANGED` when it moved. */
  update(
    row: TrackingMaster,
    expectedUpdatedAt: Date,
    change: MasterChange,
  ): Promise<void>;
  /**
   * Tombstones the row (compare-and-set on `updatedAt`) after asking
   * `stillUnused` inside the transaction; 409 `<KIND>_IN_USE` when it says
   * no.
   */
  remove(
    row: TrackingMaster,
    expectedUpdatedAt: Date,
    change: MasterChange,
    stillUnused: () => Promise<boolean>,
  ): Promise<void>;
};

/**
 * Which rows live tracking records name (CM-801): an issue's category, a
 * task's tags. Masters never imports tracking; `src/composition` reads its
 * tables.
 */
export type TrackingMasterUsage = (
  kind: TrackingMasterKind,
  workspaceId: string,
  ids: readonly string[],
) => Promise<Set<string>>;

export type TrackingMasterReadModel = {
  id: string;
  name: string;
  isSeed: boolean;
  disabled: boolean;
  /** A live tracking record names it, so it cannot be deleted. */
  inUse: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function readModel(
  row: TrackingMaster,
  used: ReadonlySet<string>,
): TrackingMasterReadModel {
  return {
    id: row.id,
    name: row.name,
    isSeed: row.isSeed,
    disabled: row.disabledAt != null,
    inUse: used.has(row.id),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type Target = { workspaceId: string; id: string; by: string };

/**
 * Issue Categories and Tags (CM-801, ADR CM-0019 §1; menus
 * `masters.issue_categories` and `masters.tags`): add, rename (seeds
 * too), disable / enable (Issue Categories), delete only when unused (409
 * `<KIND>_IN_USE`). `ensure` is the Task form's inline tag create: the live
 * tag of that name, or a new one. Access is checked by the routes.
 */
export class TrackingMasterHandlers {
  constructor(
    private readonly kind: TrackingMasterKind,
    private readonly store: TrackingMasterStore,
    private readonly usage: TrackingMasterUsage,
    private readonly newId: (now: Date) => string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async load(workspaceId: string, id: string) {
    const row = await this.store.find(this.kind, workspaceId, id);
    if (row == null) throw masterNotFound(this.kind);
    return row;
  }

  private async view(row: TrackingMaster) {
    return readModel(
      row,
      await this.usage(this.kind, row.workspaceId, [row.id]),
    );
  }

  async list(workspaceId: string): Promise<TrackingMasterReadModel[]> {
    const rows = await this.store.list(this.kind, workspaceId);
    const used = await this.usage(
      this.kind,
      workspaceId,
      rows.map((row) => row.id),
    );
    return rows.map((row) => readModel(row, used));
  }

  async get(workspaceId: string, id: string) {
    return this.view(await this.load(workspaceId, id));
  }

  async create(input: { workspaceId: string; name: string; by: string }) {
    const now = this.clock();
    const row = newTrackingMaster({
      id: this.newId(now),
      kind: this.kind,
      workspaceId: input.workspaceId,
      name: input.name,
      by: input.by,
      now,
    });
    await this.store.insert(row, {
      action: `${this.kind}.created`,
      before: null,
      by: input.by,
      now,
    });
    return readModel(row, new Set());
  }

  /**
   * The live row named `name` (any case), or a new one: `created` says
   * which. A racing create of the same name ends with the winner's row.
   */
  async ensure(input: { workspaceId: string; name: string; by: string }) {
    const name = cleanMasterName(this.kind, input.name);
    const found = await this.store.findByName(
      this.kind,
      input.workspaceId,
      name,
    );
    if (found != null) return { item: await this.view(found), created: false };
    try {
      return { item: await this.create(input), created: true };
    } catch (error) {
      const raced = await this.store.findByName(
        this.kind,
        input.workspaceId,
        name,
      );
      if (raced == null) throw error;
      return { item: await this.view(raced), created: false };
    }
  }

  async rename(input: Target & { name: string; expectedUpdatedAt: Date }) {
    const row = await this.load(input.workspaceId, input.id);
    if (row.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw masterChanged(this.kind);
    const name = cleanMasterName(this.kind, input.name);
    if (name === row.name) return this.view(row);
    const now = this.clock();
    const next = { ...row, name, updatedAt: now, updatedBy: input.by };
    await this.store.update(next, row.updatedAt, {
      action: `${this.kind}.renamed`,
      before: trackingMasterSnapshot(row),
      by: input.by,
      now,
    });
    return this.view(next);
  }

  /** Off the pickers or back on (Issue Categories); idempotent. */
  async setDisabled(input: Target & { disabled: boolean }) {
    const row = await this.load(input.workspaceId, input.id);
    assertDisableable(row);
    if ((row.disabledAt != null) === input.disabled) return this.view(row);
    const now = this.clock();
    const next = {
      ...row,
      disabledAt: input.disabled ? now : null,
      updatedAt: now,
      updatedBy: input.by,
    };
    await this.store.update(next, row.updatedAt, {
      action: `${this.kind}.${input.disabled ? "disabled" : "enabled"}`,
      before: trackingMasterSnapshot(row),
      by: input.by,
      now,
    });
    return this.view(next);
  }

  /** A tombstone; 409 `<KIND>_IN_USE` while a live tracking record names it. */
  async delete(input: Target): Promise<void> {
    const row = await this.load(input.workspaceId, input.id);
    const unused = async () =>
      (await this.usage(this.kind, row.workspaceId, [row.id])).size === 0;
    if (!(await unused())) throw masterInUse(this.kind);
    const now = this.clock();
    await this.store.remove(
      row,
      row.updatedAt,
      {
        action: `${this.kind}.deleted`,
        before: trackingMasterSnapshot(row),
        by: input.by,
        now,
      },
      unused,
    );
  }
}
