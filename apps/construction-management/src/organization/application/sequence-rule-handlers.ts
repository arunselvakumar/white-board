import { DomainError, notFound } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import {
  createSequenceRuleSettings,
  isSequenceModuleKey,
  type SequenceModuleKey,
  type SequenceRule,
  type SequenceRuleSettingsInput,
} from "@/src/shared-kernel/sequence";

export type SequenceRuleRecord = SequenceRule & {
  /** True once a number has been issued from it; it can then not be deleted. */
  issued: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type SequenceRuleStore = {
  /** Live rules, in module order, the default first. */
  list(
    workspaceId: string,
    module: SequenceModuleKey | null,
  ): Promise<SequenceRuleRecord[]>;
  find(workspaceId: string, id: string): Promise<SequenceRuleRecord | null>;
  /** Inserts and audits; 409 `SEQUENCE_RULE_EXISTS` for a second default or project rule. */
  insert(rule: SequenceRule, by: string, now: Date): Promise<void>;
  /**
   * Updates the settings and audits before/after; 409
   * `SEQUENCE_RULE_CHANGED` when the stored `updatedAt` is not `expectedUpdatedAt`.
   */
  update(
    rule: SequenceRule,
    expectedUpdatedAt: Date,
    by: string,
    now: Date,
  ): Promise<void>;
  /** Tombstones and audits; 409 `SEQUENCE_RULE_IN_USE` once it has issued a number. */
  delete(workspaceId: string, id: string, by: string, now: Date): Promise<void>;
};

function moduleOf(value: string): SequenceModuleKey {
  if (!isSequenceModuleKey(value))
    throw new DomainError(
      "SEQUENCE_MODULE_UNKNOWN",
      `"${value}" does not use Sequence IDs.`,
    );
  return value;
}

/** Manage Sequence IDs (CM-114). Access is checked by the caller. */
export class SequenceRuleHandlers {
  constructor(
    private readonly store: SequenceRuleStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async load(
    workspaceId: string,
    id: string,
  ): Promise<SequenceRuleRecord> {
    const found = await this.store.find(workspaceId, id);
    if (found == null)
      throw notFound(
        "SEQUENCE_RULE_NOT_FOUND",
        "This Sequence ID rule was not found.",
      );
    return found;
  }

  list(
    workspaceId: string,
    module: string | null,
  ): Promise<SequenceRuleRecord[]> {
    return this.store.list(
      workspaceId,
      module == null ? null : moduleOf(module),
    );
  }

  async create(input: {
    workspaceId: string;
    module: string;
    projectId: string | null;
    settings: SequenceRuleSettingsInput;
    by: string;
  }): Promise<SequenceRuleRecord> {
    const now = this.clock();
    const rule: SequenceRule = {
      id: newId(now.getTime()),
      workspaceId: input.workspaceId,
      module: moduleOf(input.module),
      projectId: input.projectId,
      ...createSequenceRuleSettings(input.settings),
    };
    await this.store.insert(rule, input.by, now);
    return { ...rule, issued: false, createdAt: now, updatedAt: now };
  }

  async update(input: {
    workspaceId: string;
    id: string;
    settings: SequenceRuleSettingsInput;
    expectedUpdatedAt: Date;
    by: string;
  }): Promise<SequenceRuleRecord> {
    const current = await this.load(input.workspaceId, input.id);
    const now = this.clock();
    const rule: SequenceRule = {
      id: current.id,
      workspaceId: current.workspaceId,
      module: current.module,
      projectId: current.projectId,
      ...createSequenceRuleSettings(input.settings),
    };
    await this.store.update(rule, input.expectedUpdatedAt, input.by, now);
    return { ...current, ...rule, updatedAt: now };
  }

  async delete(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<void> {
    await this.store.delete(
      input.workspaceId,
      input.id,
      input.by,
      this.clock(),
    );
  }
}
