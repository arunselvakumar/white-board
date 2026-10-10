import { formatMobile } from "@repo/auth/construction/mobile";

import { DomainError, conflict } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";

import {
  PARTY_KIND_INFO,
  Party,
  partyChanged,
  partyNotFound,
  type PartyDetailsInput,
  type PartyKind,
} from "../domain/party";
import type { MasterChange } from "./ports";

export type PartyListParams = {
  workspaceId: string;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
  /** Name, contact person, GSTIN or mobile digits. */
  search?: string;
  isActive?: boolean;
  /** Only parties assigned to this Project. */
  projectId?: string;
};

export type PartyListPage = { items: Party[]; total: number; hasMore: boolean };

/** A party whose Projects changed from a Project's Resources. */
export type PartyProjectChange = {
  party: Party;
  /** The `updatedAt` it was loaded with; a stale one is 409. */
  loadedAt: Date;
  projectId: string;
  joined: boolean;
  change: MasterChange;
};

/** Contractors and Suppliers in `construction_masters` (Prisma in infrastructure). */
export type PartyStore = {
  /** A live party of the kind. */
  find(kind: PartyKind, workspaceId: string, id: string): Promise<Party | null>;
  /** The live parties of the kind among `ids`. */
  findMany(
    kind: PartyKind,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Party[]>;
  /** Newest first (root ADR-0020). */
  list(kind: PartyKind, params: PartyListParams): Promise<PartyListPage>;
  /** Live parties on the Project, active or not, by name. */
  listOnProject(
    kind: PartyKind,
    workspaceId: string,
    projectId: string,
  ): Promise<Party[]>;
  /** Live active parties, by name: what pickers offer. */
  listActive(kind: PartyKind, workspaceId: string): Promise<Party[]>;
  /** Inserts and audits; 409 `<KIND>_NAME_IN_USE` for a live name. */
  insert(party: Party, change: MasterChange): Promise<void>;
  /**
   * Writes the party, its Departments and Projects when its stored
   * `updatedAt` is still `expectedUpdatedAt`, and audits; 409
   * `<KIND>_CHANGED` otherwise, `<KIND>_NAME_IN_USE` for a live name.
   */
  update(
    party: Party,
    expectedUpdatedAt: Date,
    change: MasterChange,
  ): Promise<void>;
  /**
   * Adds or removes one Project link per party, compare-and-set on each
   * party's `updatedAt`, with one audit row each, in one transaction.
   */
  updateProjects(changes: readonly PartyProjectChange[]): Promise<void>;
};

/**
 * Whether documents of another context point at a party (CM-501): a
 * Supplier on a Purchase Order or Goods Receipt, a Contractor on a
 * Material Request. Implemented in `src/composition`.
 */
export type PartyUsage = (
  kind: PartyKind,
  workspaceId: string,
  id: string,
) => Promise<boolean>;

/** Records other contexts own, read by id (no imports of their code). */
export type PartyDirectory = {
  /** The live Projects among `ids`, with their names. */
  projects(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, { id: string; name: string }>>;
  /** The live Departments among `ids`; `disabled` ones leave pickers. */
  departments(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, { id: string; name: string; disabled: boolean }>>;
};

export type PartyRef = { id: string; name: string };

export type PartyReadModel = {
  id: string;
  kind: PartyKind;
  name: string;
  contactPerson: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  pan: string | null;
  /** GST state code: the GSTIN's first two digits, or the one picked. */
  stateCode: string | null;
  /** A Contractor's second contact; null for a Supplier. */
  contactPerson2: string | null;
  mobile2: string | null;
  isActive: boolean;
  /** Live Departments, by name; empty for a Supplier. */
  departments: PartyRef[];
  /** Live Projects, by name. */
  projects: PartyRef[];
  createdAt: Date;
  updatedAt: Date;
};

/** One line of a Project's Resources. */
export type ProjectPartyReadModel = {
  id: string;
  name: string;
  /** Departments for a Contractor, the contact person for a Supplier, else the mobile. */
  detail: string | null;
  isActive: boolean;
};

export type PartyWriteInput = {
  workspaceId: string;
  details: PartyDetailsInput;
  departmentIds: readonly string[];
  projectIds: readonly string[];
  by: string;
};

const collator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

function byName<T extends { name: string }>(items: T[]): T[] {
  return items.sort((a, b) => collator.compare(a.name, b.name));
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
}

/**
 * Contractor or Supplier master commands and queries (CM-406), and their
 * side of a Project's Resources. Access is checked by the caller.
 */
export class PartyHandlers {
  constructor(
    readonly kind: PartyKind,
    private readonly store: PartyStore,
    private readonly directory: PartyDirectory,
    private readonly clock: () => Date = () => new Date(),
    /** Without it, delete does not look at documents (unit tests). */
    private readonly usage?: PartyUsage,
  ) {}

  private get info() {
    return PARTY_KIND_INFO[this.kind];
  }

  private async load(workspaceId: string, id: string): Promise<Party> {
    const found = await this.store.find(this.kind, workspaceId, id);
    if (found == null) throw partyNotFound(this.kind);
    return found;
  }

  private async assertProjects(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<void> {
    const found = await this.directory.projects(workspaceId, ids);
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0)
      throw new DomainError(
        "PROJECT_NOT_FOUND",
        "Choose Projects from the list. One of them was not found.",
        { details: { projectIds: missing } },
      );
  }

  /**
   * Departments new to the Contractor must be live and enabled; ones it
   * already has stay even if Masters disabled them since.
   */
  private async assertDepartments(
    workspaceId: string,
    ids: readonly string[],
    existing: readonly string[],
  ): Promise<void> {
    if (this.kind !== "contractor") return;
    const added = [...new Set(ids)].filter((id) => !existing.includes(id));
    const found = await this.directory.departments(workspaceId, added);
    for (const id of added) {
      const department = found.get(id);
      if (department == null)
        throw new DomainError(
          "DEPARTMENT_NOT_FOUND",
          "Choose Departments from the list. One of them was not found.",
          { details: { departmentId: id } },
        );
      if (department.disabled)
        throw new DomainError(
          "DEPARTMENT_DISABLED",
          `${department.name} is disabled in Masters, so it cannot be added.`,
          { details: { departmentId: id } },
        );
    }
  }

  private async readModels(
    workspaceId: string,
    parties: readonly Party[],
  ): Promise<PartyReadModel[]> {
    const [projects, departments] = await Promise.all([
      this.directory.projects(
        workspaceId,
        parties.flatMap((party) => party.projectIds),
      ),
      this.directory.departments(
        workspaceId,
        parties.flatMap((party) => party.departmentIds),
      ),
    ]);
    const refs = (
      ids: readonly string[],
      found: Map<string, { id: string; name: string }>,
    ): PartyRef[] =>
      byName(
        ids.flatMap((id) => {
          const item = found.get(id);
          return item == null ? [] : [{ id: item.id, name: item.name }];
        }),
      );
    return parties.map((party) => ({
      id: party.id,
      kind: party.kind,
      ...party.details,
      isActive: party.isActive,
      departments: refs(party.departmentIds, departments),
      projects: refs(party.projectIds, projects),
      createdAt: party.createdAt,
      updatedAt: party.updatedAt,
    }));
  }

  private async readModel(party: Party): Promise<PartyReadModel> {
    const [model] = await this.readModels(party.workspaceId, [party]);
    if (model == null) throw partyNotFound(this.kind);
    return model;
  }

  private async projectParties(
    workspaceId: string,
    parties: readonly Party[],
  ): Promise<ProjectPartyReadModel[]> {
    const models = await this.readModels(workspaceId, parties);
    return models.map((model) => {
      const mobile = model.mobile == null ? null : formatMobile(model.mobile);
      const departments = model.departments.map((item) => item.name).join(", ");
      return {
        id: model.id,
        name: model.name,
        detail:
          (departments === "" ? null : departments) ??
          model.contactPerson ??
          mobile,
        isActive: model.isActive,
      };
    });
  }

  async list(params: PartyListParams): Promise<{
    items: PartyReadModel[];
    total: number;
    hasMore: boolean;
  }> {
    const page = await this.store.list(this.kind, params);
    return {
      items: await this.readModels(params.workspaceId, page.items),
      total: page.total,
      hasMore: page.hasMore,
    };
  }

  async get(workspaceId: string, id: string): Promise<PartyReadModel> {
    return this.readModel(await this.load(workspaceId, id));
  }

  async create(input: PartyWriteInput): Promise<PartyReadModel> {
    const now = this.clock();
    const party = Party.create({
      id: newId(now.getTime()),
      workspaceId: input.workspaceId,
      kind: this.kind,
      details: input.details,
      departmentIds: input.departmentIds,
      projectIds: input.projectIds,
      by: input.by,
      now,
    });
    await this.assertProjects(input.workspaceId, party.projectIds);
    await this.assertDepartments(input.workspaceId, party.departmentIds, []);
    await this.store.insert(party, {
      action: `${this.kind}.created`,
      before: null,
      by: input.by,
      now,
    });
    return this.readModel(party);
  }

  /** The whole form; 409 `<KIND>_CHANGED` when stale. */
  async update(
    input: PartyWriteInput & { id: string; expectedUpdatedAt: Date },
  ): Promise<PartyReadModel> {
    const party = await this.load(input.workspaceId, input.id);
    if (party.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw partyChanged(this.kind);
    const before = party.snapshot();
    const now = this.clock();
    party.update(input, input.by, now);
    const keptProjects = new Set(before.projectIds);
    await this.assertProjects(
      input.workspaceId,
      party.projectIds.filter((id) => !keptProjects.has(id)),
    );
    await this.assertDepartments(
      input.workspaceId,
      party.departmentIds,
      before.departmentIds,
    );
    await this.store.update(party, input.expectedUpdatedAt, {
      action: `${this.kind}.updated`,
      before,
      by: input.by,
      now,
    });
    return this.readModel(party);
  }

  async setActive(input: {
    workspaceId: string;
    id: string;
    isActive: boolean;
    by: string;
  }): Promise<PartyReadModel> {
    const party = await this.load(input.workspaceId, input.id);
    const loadedAt = party.updatedAt;
    const before = party.snapshot();
    const now = this.clock();
    if (party.setActive(input.isActive, input.by, now))
      await this.store.update(party, loadedAt, {
        action: `${this.kind}.${input.isActive ? "activated" : "deactivated"}`,
        before,
        by: input.by,
        now,
      });
    return this.readModel(party);
  }

  /**
   * Tombstones; 409 `<KIND>_ON_PROJECTS` while the party is on a live
   * Project (take it off there first, or make it inactive), 409
   * `<KIND>_IN_USE` while a document names it (CM-501).
   */
  async delete(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<void> {
    const party = await this.load(input.workspaceId, input.id);
    const live = await this.directory.projects(
      input.workspaceId,
      party.projectIds,
    );
    if (live.size > 0) {
      const names = [...live.values()].map((project) => project.name);
      throw conflict(
        `${this.info.code}_ON_PROJECTS`,
        `This ${this.info.label} is on ${names.join(", ")}. Take them off their Projects first, or make them inactive.`,
        { projectIds: [...live.keys()] },
      );
    }
    if (
      this.usage != null &&
      (await this.usage(this.kind, input.workspaceId, input.id))
    )
      throw conflict(
        `${this.info.code}_IN_USE`,
        this.kind === "supplier"
          ? "Purchase Orders or Goods Receipts name this Supplier, so it cannot be deleted. Make them inactive instead."
          : "Material Requests name this Contractor, so it cannot be deleted. Make them inactive instead.",
      );
    const loadedAt = party.updatedAt;
    const before = party.snapshot();
    const now = this.clock();
    party.delete(input.by, now);
    await this.store.update(party, loadedAt, {
      action: `${this.kind}.deleted`,
      before,
      by: input.by,
      now,
    });
  }

  /** The parties on a Project's Resources, active or not, by name. */
  async onProject(
    workspaceId: string,
    projectId: string,
  ): Promise<ProjectPartyReadModel[]> {
    return this.projectParties(
      workspaceId,
      await this.store.listOnProject(this.kind, workspaceId, projectId),
    );
  }

  /** Active parties of the Company: what a Resources picker offers. */
  async assignable(workspaceId: string): Promise<ProjectPartyReadModel[]> {
    return this.projectParties(
      workspaceId,
      await this.store.listActive(this.kind, workspaceId),
    );
  }

  /**
   * Makes `ids` the parties on the Project (Resources, CM-406). The caller
   * has checked the Project is live and visible. `expectedIds` is the set
   * the screen loaded: 409 `PROJECT_RESOURCES_CHANGED` when someone changed
   * it since. 400 `<KIND>_NOT_FOUND` for an id that is not a live party of
   * the Company, `<KIND>_INACTIVE` for an inactive one newly added.
   */
  async setOnProject(input: {
    workspaceId: string;
    projectId: string;
    ids: readonly string[];
    expectedIds: readonly string[];
    by: string;
  }): Promise<void> {
    const current = await this.store.listOnProject(
      this.kind,
      input.workspaceId,
      input.projectId,
    );
    if (
      !sameSet(
        current.map((party) => party.id),
        input.expectedIds,
      )
    )
      throw resourcesChanged();
    const wanted = new Set(input.ids);
    const currentIds = new Set(current.map((party) => party.id));
    const addedIds = [...wanted].filter((id) => !currentIds.has(id));
    const added = await this.store.findMany(
      this.kind,
      input.workspaceId,
      addedIds,
    );
    const found = new Set(added.map((party) => party.id));
    const missing = addedIds.filter((id) => !found.has(id));
    if (missing.length > 0)
      throw new DomainError(
        `${this.info.code}_NOT_FOUND`,
        `Choose ${this.info.plural} from the list. One of them was not found.`,
        { details: { ids: missing } },
      );
    const now = this.clock();
    const changes: PartyProjectChange[] = [];
    const record = (party: Party, joined: boolean) => {
      const loadedAt = party.updatedAt;
      const before = party.snapshot();
      if (joined) party.joinProject(input.projectId, input.by, now);
      else party.leaveProject(input.projectId, input.by, now);
      changes.push({
        party,
        loadedAt,
        projectId: input.projectId,
        joined,
        change: {
          action: `${this.kind}.projects_changed`,
          before: { projectIds: before.projectIds },
          by: input.by,
          now,
        },
      });
    };
    for (const party of added) record(party, true);
    for (const party of current)
      if (!wanted.has(party.id)) record(party, false);
    if (changes.length > 0) await this.store.updateProjects(changes);
  }
}

/** Someone changed the Project's Resources after the screen loaded them. */
export function resourcesChanged(): DomainError {
  return conflict(
    "PROJECT_RESOURCES_CHANGED",
    "Someone else changed this Project's Resources after you opened them. Reload to see their changes.",
  );
}
