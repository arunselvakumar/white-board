import { DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import { LookupEntry } from "../domain/lookup-entry";
import {
  DEVELOPMENT_KINDS,
  MASTER_KINDS,
  masterChanged,
  masterInUse,
  masterNotFound,
  type DevelopmentKind,
} from "../domain/master-kind";
import type { LookupStatusFilter } from "./lookup-handlers";
import type {
  DevelopmentRow,
  DevelopmentStore,
  ProjectDirectory,
} from "./ports";

/** An Amenity or Common Development as the masters screens show it. */
export type DevelopmentReadModel = {
  id: string;
  name: string;
  isSeed: boolean;
  disabled: boolean;
  /** Live Projects it is assigned to that the caller may see. */
  projectIds: string[];
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Projects the caller may see: null for the Owner (every Project), a
 * Member's assigned Projects otherwise.
 */
export type VisibleProjects = ReadonlySet<string> | null;

function visibleOnly(ids: readonly string[], visible: VisibleProjects) {
  return visible == null ? [...ids] : ids.filter((id) => visible.has(id));
}

function toReadModel(
  row: DevelopmentRow,
  visible: VisibleProjects,
): DevelopmentReadModel {
  return {
    id: row.entry.id,
    name: row.entry.name,
    isSeed: row.entry.isSeed,
    disabled: row.entry.disabled,
    projectIds: visibleOnly(row.projectIds, visible),
    createdAt: row.entry.createdAt,
    updatedAt: row.entry.updatedAt,
  };
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim().toLowerCase()))].filter(
    (id) => id.length > 0,
  );
}

function unknownProjects(projectIds: readonly string[]): DomainError {
  return new DomainError(
    "PROJECT_NOT_FOUND",
    "Choose Projects from the list. One of them was not found.",
    { details: { projectIds } },
  );
}

function disabledRow(kind: DevelopmentKind, ids?: string[]): DomainError {
  const { code, label } = MASTER_KINDS[kind];
  return new DomainError(
    `${code}_DISABLED`,
    `This ${label} is disabled. Enable it in Masters before assigning it to more Projects.`,
    ids == null ? {} : { details: { ids } },
  );
}

/**
 * Amenities or Common Developments in Masters (CM-404): the Labour
 * Category rules (seed rows disabled, never renamed or deleted; names
 * unique per kind ignoring case) plus the Projects each is assigned to.
 * A row cannot be deleted while a live Project has it; a disabled row
 * stays on its Projects but cannot be assigned to more. Access is checked
 * by the caller; `visible` limits which Project links a Member sees and
 * changes.
 */
export class DevelopmentHandlers {
  constructor(
    private readonly kind: DevelopmentKind,
    private readonly store: DevelopmentStore,
    private readonly projects: ProjectDirectory,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async load(workspaceId: string, id: string): Promise<DevelopmentRow> {
    const found = await this.store.find(this.kind, workspaceId, id);
    if (found == null) throw masterNotFound(this.kind);
    return found;
  }

  /** 400 `PROJECT_NOT_FOUND` unless every id is a live Project the caller sees. */
  private async assertProjects(
    workspaceId: string,
    ids: readonly string[],
    visible: VisibleProjects,
  ): Promise<void> {
    if (ids.length === 0) return;
    const hidden = visible == null ? [] : ids.filter((id) => !visible.has(id));
    const unknown = await this.projects.unknownIds(workspaceId, ids);
    const refused = [...new Set([...hidden, ...unknown])];
    if (refused.length > 0) throw unknownProjects(refused);
  }

  async list(
    workspaceId: string,
    status: LookupStatusFilter,
    visible: VisibleProjects,
  ): Promise<DevelopmentReadModel[]> {
    const rows = await this.store.list(this.kind, workspaceId);
    return rows
      .filter(
        (row) =>
          status === "all" || row.entry.disabled === (status === "disabled"),
      )
      .map((row) => toReadModel(row, visible));
  }

  async get(
    workspaceId: string,
    id: string,
    visible: VisibleProjects,
  ): Promise<DevelopmentReadModel> {
    return toReadModel(await this.load(workspaceId, id), visible);
  }

  /** Adds a row, assigned to `projectIds` (none when left out). */
  async create(input: {
    workspaceId: string;
    name: string;
    projectIds?: readonly string[];
    by: string;
    visible: VisibleProjects;
  }): Promise<DevelopmentReadModel> {
    const now = this.clock();
    const entry = LookupEntry.create({
      id: newId(now.getTime()),
      kind: this.kind,
      workspaceId: input.workspaceId,
      name: input.name,
      by: input.by,
      now,
    });
    const projectIds = unique(input.projectIds ?? []);
    await this.assertProjects(input.workspaceId, projectIds, input.visible);
    await this.store.insert(entry, projectIds, {
      action: `${this.kind}.created`,
      before: null,
      by: input.by,
      now,
    });
    return toReadModel(
      await this.load(input.workspaceId, entry.id),
      input.visible,
    );
  }

  /** Renames a Company-made row; 409 `<KIND>_CHANGED` on a stale `expectedUpdatedAt`. */
  async rename(input: {
    workspaceId: string;
    id: string;
    name: string;
    expectedUpdatedAt: Date;
    by: string;
    visible: VisibleProjects;
  }): Promise<DevelopmentReadModel> {
    const row = await this.load(input.workspaceId, input.id);
    if (row.entry.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw masterChanged(this.kind);
    const before = row.entry.snapshot();
    const now = this.clock();
    row.entry.rename(input.name, input.by, now);
    await this.store.update(row.entry, input.expectedUpdatedAt, {
      action: `${this.kind}.updated`,
      before,
      by: input.by,
      now,
    });
    return toReadModel(row, input.visible);
  }

  async disable(input: {
    workspaceId: string;
    id: string;
    by: string;
    visible: VisibleProjects;
  }): Promise<DevelopmentReadModel> {
    return this.toggle(input, "disable");
  }

  async enable(input: {
    workspaceId: string;
    id: string;
    by: string;
    visible: VisibleProjects;
  }): Promise<DevelopmentReadModel> {
    return this.toggle(input, "enable");
  }

  private async toggle(
    input: {
      workspaceId: string;
      id: string;
      by: string;
      visible: VisibleProjects;
    },
    to: "disable" | "enable",
  ): Promise<DevelopmentReadModel> {
    const row = await this.load(input.workspaceId, input.id);
    const loadedAt = row.entry.updatedAt;
    const before = row.entry.snapshot();
    const now = this.clock();
    const changed =
      to === "disable"
        ? row.entry.disable(input.by, now)
        : row.entry.enable(input.by, now);
    if (changed)
      await this.store.update(row.entry, loadedAt, {
        action: `${this.kind}.${to}d`,
        before,
        by: input.by,
        now,
      });
    return toReadModel(row, input.visible);
  }

  /**
   * Tombstones a Company-made row. 409 `SEED_IS_READ_ONLY` for a seed row
   * and `<KIND>_IN_USE` while a live Project is assigned it — any Project,
   * not only the caller's.
   */
  async delete(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<void> {
    const row = await this.load(input.workspaceId, input.id);
    const loadedAt = row.entry.updatedAt;
    const before = row.entry.snapshot();
    const now = this.clock();
    row.entry.delete(input.by, now);
    if (row.projectIds.length > 0) throw masterInUse(this.kind);
    await this.store.update(row.entry, loadedAt, {
      action: `${this.kind}.deleted`,
      before,
      by: input.by,
      now,
    });
  }

  /**
   * Assigns the row to exactly `projectIds` among the Projects the caller
   * sees (from the master's Projects picker); its links to Projects the
   * caller cannot see are kept. 400 `PROJECT_NOT_FOUND` for an id that is
   * not a live Project the caller sees, `<KIND>_DISABLED` when a disabled
   * row would gain a Project.
   */
  async assignProjects(input: {
    workspaceId: string;
    id: string;
    projectIds: readonly string[];
    by: string;
    visible: VisibleProjects;
  }): Promise<DevelopmentReadModel> {
    const row = await this.load(input.workspaceId, input.id);
    const wanted = unique(input.projectIds);
    await this.assertProjects(input.workspaceId, wanted, input.visible);
    const visible = input.visible;
    const kept =
      visible == null ? [] : row.projectIds.filter((id) => !visible.has(id));
    const next = [...new Set([...kept, ...wanted])];
    const current = new Set(row.projectIds);
    const added = next.filter((id) => !current.has(id));
    if (row.entry.disabled && added.length > 0) throw disabledRow(this.kind);
    const removed = row.projectIds.filter((id) => !next.includes(id));
    if (added.length > 0 || removed.length > 0)
      await this.store.setProjects(row.entry, next, {
        action: `${this.kind}.projects_assigned`,
        before: { projectIds: row.projectIds },
        by: input.by,
        now: this.clock(),
      });
    // Read back, so the Projects come in the list's order (by name).
    return toReadModel(await this.load(input.workspaceId, input.id), visible);
  }
}

/** One assigned or offered row on a Project's Amenities page. */
export type ProjectDevelopmentItem = {
  id: string;
  name: string;
  disabled: boolean;
};

/** Per kind: what the Project has and what can be added. */
export type ProjectDevelopmentsReadModel = Record<
  DevelopmentKind,
  {
    /** Live rows assigned to the Project, disabled ones included, by name. */
    assigned: ProjectDevelopmentItem[];
    /** The Company's live, enabled rows: what the picker offers. */
    choices: ProjectDevelopmentItem[];
  }
>;

function item(entry: LookupEntry<DevelopmentKind>): ProjectDevelopmentItem {
  return { id: entry.id, name: entry.name, disabled: entry.disabled };
}

/**
 * The Project side of the assignment (CM-404): a Project's Amenities and
 * Common Developments, read and replaced per kind. The caller has already
 * checked the Project (it exists, the caller may see and change it).
 */
export class ProjectDevelopmentHandlers {
  constructor(
    private readonly store: DevelopmentStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /**
   * Only the Project's live rows of each kind, disabled ones included, by
   * name: what its site entries may be located at (CM-403).
   */
  async assigned(
    workspaceId: string,
    projectId: string,
  ): Promise<Record<DevelopmentKind, ProjectDevelopmentItem[]>> {
    const rows = await this.store.listForProject(workspaceId, projectId);
    const result = {} as Record<DevelopmentKind, ProjectDevelopmentItem[]>;
    for (const kind of DEVELOPMENT_KINDS)
      result[kind] = rows
        .filter((entry) => entry.kind === kind)
        .map((entry) => item(entry));
    return result;
  }

  /** The Project's rows of each kind, and the rows the picker offers. */
  async forProject(
    workspaceId: string,
    projectId: string,
  ): Promise<ProjectDevelopmentsReadModel> {
    const [assigned, ...lists] = await Promise.all([
      this.store.listForProject(workspaceId, projectId),
      ...DEVELOPMENT_KINDS.map((kind) => this.store.list(kind, workspaceId)),
    ]);
    const result = {} as ProjectDevelopmentsReadModel;
    DEVELOPMENT_KINDS.forEach((kind, index) => {
      result[kind] = {
        assigned: assigned
          .filter((entry) => entry.kind === kind)
          .map((entry) => item(entry)),
        choices: (lists[index] ?? [])
          .filter((row) => !row.entry.disabled)
          .map((row) => item(row.entry)),
      };
    });
    return result;
  }

  /**
   * Replaces the Project's rows of each kind given (a kind left out keeps
   * its rows). Every id must be a live row of that kind of the Company
   * (400 `<KIND>_NOT_FOUND` with `details.ids`); a row the Project does not
   * have yet must be enabled (400 `<KIND>_DISABLED`), while a disabled row
   * it already has may stay.
   */
  async assign(input: {
    workspaceId: string;
    projectId: string;
    ids: Partial<Record<DevelopmentKind, readonly string[]>>;
    by: string;
  }): Promise<ProjectDevelopmentsReadModel> {
    const assigned = await this.store.listForProject(
      input.workspaceId,
      input.projectId,
    );
    const writes: { kind: DevelopmentKind; ids: string[]; before: string[] }[] =
      [];
    for (const kind of DEVELOPMENT_KINDS) {
      const raw = input.ids[kind];
      if (raw == null) continue;
      const wanted = unique(raw);
      const rows = await this.store.list(kind, input.workspaceId);
      const byId = new Map(rows.map((row) => [row.entry.id, row.entry]));
      const unknown = wanted.filter((id) => !byId.has(id));
      if (unknown.length > 0) {
        const { code, label } = MASTER_KINDS[kind];
        throw new DomainError(
          `${code}_NOT_FOUND`,
          `Choose ${label} rows from the list. One of them was not found.`,
          { details: { ids: unknown } },
        );
      }
      const before = assigned
        .filter((entry) => entry.kind === kind)
        .map((entry) => entry.id);
      const disabled = wanted.filter(
        (id) => !before.includes(id) && byId.get(id)?.disabled === true,
      );
      if (disabled.length > 0) throw disabledRow(kind, disabled);
      const same =
        before.length === wanted.length &&
        before.every((id) => wanted.includes(id));
      if (!same) writes.push({ kind, ids: wanted, before });
    }
    const now = this.clock();
    for (const write of writes)
      await this.store.setForProject({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        ...write,
        by: input.by,
        now,
      });
    return this.forProject(input.workspaceId, input.projectId);
  }
}
