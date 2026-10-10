import { assertCan, type MemberAccess } from "@/src/shared-kernel/access";
import { DomainError, notFound } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import type { MonthKey } from "../domain/calendar";
import type { SalaryStatutoryFigures } from "../domain/salary-calculation";
import {
  createSalaryStructure,
  type SalaryStructure,
  type SalaryStructureInput,
} from "../domain/salary-structure";
import type { HrmsSettingsReader, StatutoryRates } from "./ports";

export type StoredSalaryStructure = {
  id: string;
  structure: SalaryStructure;
  /** Members whose live salary configuration uses it. */
  membersUsing: number;
  createdAt: Date;
  updatedAt: Date;
};

export type SalaryStructureStore = {
  /** Live structures of the Company, by name. */
  list(workspaceId: string): Promise<StoredSalaryStructure[]>;
  find(workspaceId: string, id: string): Promise<StoredSalaryStructure | null>;
  /** Inserts it with its components, deductions and the audit event. 409 `SALARY_STRUCTURE_NAME_TAKEN`. */
  create(input: {
    workspaceId: string;
    id: string;
    structure: SalaryStructure;
    by: string;
    now: Date;
  }): Promise<void>;
  /**
   * Replaces it (components keep their ids) and audits before and after.
   * 404 when gone, 409 `SALARY_STRUCTURE_CHANGED` when `updatedAt` moved,
   * 409 `SALARY_STRUCTURE_NAME_TAKEN`.
   */
  update(input: {
    workspaceId: string;
    id: string;
    structure: SalaryStructure;
    expectedUpdatedAt: Date;
    by: string;
    now: Date;
  }): Promise<void>;
  /**
   * Tombstones it. 409 `SALARY_STRUCTURE_IN_USE` while a live member
   * configuration uses it, 409 `SALARY_STRUCTURE_CHANGED`, 404 when gone.
   */
  delete(input: {
    workspaceId: string;
    id: string;
    expectedUpdatedAt: Date;
    by: string;
    now: Date;
  }): Promise<void>;
};

/** A save from the screen: components without an id are new. */
export type SalaryStructureSave = Omit<SalaryStructureInput, "components"> & {
  components: (Omit<SalaryStructureInput["components"][number], "id"> & {
    id: string | null;
  })[];
};

export function salaryStructureNotFound(): DomainError {
  return notFound(
    "SALARY_STRUCTURE_NOT_FOUND",
    "This salary structure was not found. It may have been deleted.",
  );
}

/**
 * Salary structures (CM-314), menu `hrms.salary_structures`: read to list
 * and open, create, update and delete. Every write is audited; edits and
 * deletes carry the `updatedAt` the screen loaded.
 */
export class SalaryStructureHandlers {
  constructor(
    private readonly store: SalaryStructureStore,
    private readonly deps: {
      settings: HrmsSettingsReader;
      statutoryRates: StatutoryRates;
    },
    private readonly clock: () => Date = () => new Date(),
  ) {}

  list(input: { access: MemberAccess }): Promise<StoredSalaryStructure[]> {
    assertCan(input.access, "hrms.salary_structures", "read");
    return this.store.list(input.access.workspaceId);
  }

  async get(input: {
    access: MemberAccess;
    id: string;
  }): Promise<StoredSalaryStructure> {
    assertCan(input.access, "hrms.salary_structures", "read");
    const found = await this.store.find(input.access.workspaceId, input.id);
    if (found == null) throw salaryStructureNotFound();
    return found;
  }

  async create(input: {
    access: MemberAccess;
    structure: SalaryStructureSave;
  }): Promise<StoredSalaryStructure> {
    assertCan(input.access, "hrms.salary_structures", "create");
    const now = this.clock();
    const structure = createSalaryStructure(
      withComponentIds(input.structure, new Set(), now),
    );
    const id = newId(now.getTime());
    await this.store.create({
      workspaceId: input.access.workspaceId,
      id,
      structure,
      by: input.access.userId,
      now,
    });
    return { id, structure, membersUsing: 0, createdAt: now, updatedAt: now };
  }

  async update(input: {
    access: MemberAccess;
    id: string;
    structure: SalaryStructureSave;
    expectedUpdatedAt: Date;
  }): Promise<StoredSalaryStructure> {
    assertCan(input.access, "hrms.salary_structures", "update");
    const stored = await this.store.find(input.access.workspaceId, input.id);
    if (stored == null) throw salaryStructureNotFound();
    const now = this.clock();
    const structure = createSalaryStructure(
      withComponentIds(
        input.structure,
        new Set(stored.structure.components.map((component) => component.id)),
        now,
      ),
    );
    await this.store.update({
      workspaceId: input.access.workspaceId,
      id: input.id,
      structure,
      expectedUpdatedAt: input.expectedUpdatedAt,
      by: input.access.userId,
      now,
    });
    return { ...stored, structure, updatedAt: now };
  }

  async delete(input: {
    access: MemberAccess;
    id: string;
    expectedUpdatedAt: Date;
  }): Promise<void> {
    assertCan(input.access, "hrms.salary_structures", "delete");
    await this.store.delete({
      workspaceId: input.access.workspaceId,
      id: input.id,
      expectedUpdatedAt: input.expectedUpdatedAt,
      by: input.access.userId,
      now: this.clock(),
    });
  }

  /**
   * The figures the screen's sample calculation uses for a month (ADR
   * CM-0008): the PF and ESI rows in force and the PT slabs of the state
   * chosen in HRMS Settings.
   */
  async statutoryFigures(input: {
    access: MemberAccess;
    month: MonthKey;
  }): Promise<SalaryStatutoryFigures> {
    assertCan(input.access, "hrms.salary_structures", "read");
    const { statutoryRates } = this.deps;
    const settings = await this.deps.settings.settingsFor(
      input.access.workspaceId,
    );
    const [pf, esi, ptSlabs] = await Promise.all([
      statutoryRates.pfFor(input.month),
      statutoryRates.esiFor(input.month),
      settings.ptStateCode == null
        ? Promise.resolve([])
        : statutoryRates.ptSlabsFor(settings.ptStateCode, input.month),
    ]);
    return { pf, esi, ptStateCode: settings.ptStateCode, ptSlabs };
  }
}

/**
 * Gives new components an id; an id the structure does not have is
 * refused, so a member's overrides can only ever point at its own lines.
 */
function withComponentIds(
  save: SalaryStructureSave,
  known: ReadonlySet<string>,
  now: Date,
): SalaryStructureInput {
  return {
    ...save,
    components: save.components.map((component, index) => {
      if (component.id != null && !known.has(component.id))
        throw new DomainError(
          "SALARY_COMPONENT_NOT_FOUND",
          "This component is not on the salary structure. Reload and try again.",
          { details: { field: `components.${String(index)}.id` } },
        );
      return { ...component, id: component.id ?? newId(now.getTime() + index) };
    }),
  };
}
