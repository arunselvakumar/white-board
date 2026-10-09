import { newId } from "@/src/shared-kernel/ids";

import { LookupEntry } from "../domain/lookup-entry";
import {
  masterChanged,
  masterInUse,
  masterNotFound,
  type LookupKind,
} from "../domain/master-kind";
import type { LookupStore, MasterUsage } from "./ports";

export type LookupEntryReadModel = {
  id: string;
  name: string;
  isSeed: boolean;
  disabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** Which rows a list returns: every live row (default), or one state. */
export type LookupStatusFilter = "all" | "enabled" | "disabled";

export function toLookupEntryReadModel(
  entry: LookupEntry,
): LookupEntryReadModel {
  return {
    id: entry.id,
    name: entry.name,
    isSeed: entry.isSeed,
    disabled: entry.disabled,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

/**
 * Labour Categories and Departments (CM-203): the same commands over two
 * lists. Access is checked by the caller.
 */
export class LookupHandlers {
  constructor(
    private readonly kind: LookupKind,
    private readonly store: LookupStore,
    private readonly clock: () => Date = () => new Date(),
    /** Without it, delete does not look for references (unit tests). */
    private readonly usage?: MasterUsage,
  ) {}

  private get prefix(): string {
    return this.kind;
  }

  private async load(workspaceId: string, id: string): Promise<LookupEntry> {
    const found = await this.store.find(this.kind, workspaceId, id);
    if (found == null) throw masterNotFound(this.kind);
    return found;
  }

  async list(
    workspaceId: string,
    status: LookupStatusFilter = "all",
  ): Promise<LookupEntryReadModel[]> {
    const entries = await this.store.list(this.kind, workspaceId);
    return entries
      .filter(
        (entry) =>
          status === "all" || entry.disabled === (status === "disabled"),
      )
      .map(toLookupEntryReadModel);
  }

  async get(workspaceId: string, id: string): Promise<LookupEntryReadModel> {
    return toLookupEntryReadModel(await this.load(workspaceId, id));
  }

  async create(input: {
    workspaceId: string;
    name: string;
    by: string;
  }): Promise<LookupEntryReadModel> {
    const now = this.clock();
    const entry = LookupEntry.create({
      id: newId(now.getTime()),
      kind: this.kind,
      workspaceId: input.workspaceId,
      name: input.name,
      by: input.by,
      now,
    });
    await this.store.insert(entry, {
      action: `${this.prefix}.created`,
      before: null,
      by: input.by,
      now,
    });
    return toLookupEntryReadModel(entry);
  }

  /** Renames a Company-made row; 409 `<ENTITY>_CHANGED` on a stale `expectedUpdatedAt`. */
  async rename(input: {
    workspaceId: string;
    id: string;
    name: string;
    expectedUpdatedAt: Date;
    by: string;
  }): Promise<LookupEntryReadModel> {
    const entry = await this.load(input.workspaceId, input.id);
    if (entry.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw masterChanged(this.kind);
    const before = entry.snapshot();
    const now = this.clock();
    entry.rename(input.name, input.by, now);
    await this.store.update(entry, input.expectedUpdatedAt, {
      action: `${this.prefix}.updated`,
      before,
      by: input.by,
      now,
    });
    return toLookupEntryReadModel(entry);
  }

  async disable(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<LookupEntryReadModel> {
    return this.toggle(input, "disable");
  }

  async enable(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<LookupEntryReadModel> {
    return this.toggle(input, "enable");
  }

  private async toggle(
    input: { workspaceId: string; id: string; by: string },
    to: "disable" | "enable",
  ): Promise<LookupEntryReadModel> {
    const entry = await this.load(input.workspaceId, input.id);
    const loadedAt = entry.updatedAt;
    const before = entry.snapshot();
    const now = this.clock();
    const changed =
      to === "disable"
        ? entry.disable(input.by, now)
        : entry.enable(input.by, now);
    if (changed)
      await this.store.update(entry, loadedAt, {
        action: `${this.prefix}.${to}d`,
        before,
        by: input.by,
        now,
      });
    return toLookupEntryReadModel(entry);
  }

  /**
   * Tombstones a Company-made row. 409 `SEED_IS_READ_ONLY` for a seed row and
   * `LABOUR_CATEGORY_IN_USE` while labourers, rate cards or attendance use it.
   */
  async delete(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<void> {
    const entry = await this.load(input.workspaceId, input.id);
    const loadedAt = entry.updatedAt;
    const before = entry.snapshot();
    const now = this.clock();
    entry.delete(input.by, now);
    if (
      this.usage != null &&
      (await this.usage(this.kind, input.workspaceId, input.id))
    )
      throw masterInUse(this.kind);
    await this.store.update(entry, loadedAt, {
      action: `${this.prefix}.deleted`,
      before,
      by: input.by,
      now,
    });
  }
}
