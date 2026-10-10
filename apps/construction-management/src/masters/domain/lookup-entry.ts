import { conflict } from "@/src/shared-kernel/domain-error";

import {
  MASTER_KINDS,
  cleanMasterName,
  masterNotFound,
  type LookupKind,
  type NamedMasterKind,
} from "./master-kind";

export type LookupEntryProps<K extends NamedMasterKind = LookupKind> = {
  id: string;
  kind: K;
  workspaceId: string;
  name: string;
  /** Copied from the seed set when the Company was created. */
  isSeed: boolean;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
  deletedBy: string | null;
};

/** What the audit log keeps of an entry. */
export type LookupEntrySnapshot = {
  name: string;
  isSeed: boolean;
  disabled: boolean;
};

/**
 * One row of a name-only lookup list: a Labour Category or a Department
 * (`modules/02`, CM-203), or an Amenity or Common Development (CM-404).
 * Seed rows can be disabled and enabled, never renamed or deleted.
 * Disabled rows stay on old records but leave pickers.
 */
export class LookupEntry<K extends NamedMasterKind = LookupKind> {
  private constructor(private props: LookupEntryProps<K>) {}

  static create<K extends NamedMasterKind>(input: {
    id: string;
    kind: K;
    workspaceId: string;
    name: string;
    isSeed?: boolean;
    by: string;
    now: Date;
  }): LookupEntry<K> {
    return new LookupEntry<K>({
      id: input.id,
      kind: input.kind,
      workspaceId: input.workspaceId,
      name: cleanMasterName(input.kind, input.name),
      isSeed: input.isSeed ?? false,
      disabledAt: null,
      createdAt: input.now,
      updatedAt: input.now,
      createdBy: input.by,
      updatedBy: input.by,
      deletedAt: null,
      deletedBy: null,
    });
  }

  static reconstitute<K extends NamedMasterKind>(
    props: LookupEntryProps<K>,
  ): LookupEntry<K> {
    return new LookupEntry<K>(props);
  }

  get id(): string {
    return this.props.id;
  }
  get kind(): K {
    return this.props.kind;
  }
  get workspaceId(): string {
    return this.props.workspaceId;
  }
  get name(): string {
    return this.props.name;
  }
  get isSeed(): boolean {
    return this.props.isSeed;
  }
  get disabled(): boolean {
    return this.props.disabledAt != null;
  }
  get disabledAt(): Date | null {
    return this.props.disabledAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get updatedBy(): string {
    return this.props.updatedBy;
  }
  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }
  get deletedBy(): string | null {
    return this.props.deletedBy;
  }

  snapshot(): LookupEntrySnapshot {
    return {
      name: this.props.name,
      isSeed: this.props.isSeed,
      disabled: this.disabled,
    };
  }

  private assertLive(): void {
    if (this.props.deletedAt != null) throw masterNotFound(this.props.kind);
  }

  private assertNotSeed(): void {
    if (this.props.isSeed) {
      const { label } = MASTER_KINDS[this.props.kind];
      throw conflict(
        "SEED_IS_READ_ONLY",
        `This ${label} came with the app, so it cannot be renamed or deleted. Disable it instead.`,
      );
    }
  }

  rename(name: string, by: string, now: Date): void {
    this.assertLive();
    this.assertNotSeed();
    this.props = {
      ...this.props,
      name: cleanMasterName(this.props.kind, name),
      updatedAt: now,
      updatedBy: by,
    };
  }

  /** Leaves the pickers; old records keep it. A no-op when already disabled. */
  disable(by: string, now: Date): boolean {
    this.assertLive();
    if (this.props.disabledAt != null) return false;
    this.props = {
      ...this.props,
      disabledAt: now,
      updatedAt: now,
      updatedBy: by,
    };
    return true;
  }

  /** Back in the pickers. A no-op when already enabled. */
  enable(by: string, now: Date): boolean {
    this.assertLive();
    if (this.props.disabledAt == null) return false;
    this.props = {
      ...this.props,
      disabledAt: null,
      updatedAt: now,
      updatedBy: by,
    };
    return true;
  }

  /** A tombstone (root ADR-0019). Seed rows are only ever disabled. */
  delete(by: string, now: Date): void {
    this.assertLive();
    this.assertNotSeed();
    this.props = {
      ...this.props,
      deletedAt: now,
      deletedBy: by,
      updatedAt: now,
      updatedBy: by,
    };
  }
}
