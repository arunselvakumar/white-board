import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError, notFound } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";

import {
  Vendor,
  type VendorDetailsInput,
  type VendorShiftInput,
} from "../domain/vendor";
import type { LabourCategoryDirectory, ProjectDirectory } from "./directories";

export type VendorListParams = {
  workspaceId: string;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
  search?: string;
  projectId?: string;
  isActive?: boolean;
};

export type VendorListPage = {
  items: Vendor[];
  total: number;
  hasMore: boolean;
};

/**
 * Where vendors live (Prisma in infrastructure). Writes run in one
 * transaction with their ledger entries and audit events (ADR CM-0004).
 */
export type VendorStore = {
  /** A live vendor with its live shifts and rates. */
  find(workspaceId: string, id: string): Promise<Vendor | null>;
  /** Newest first (root ADR-0020). */
  list(params: VendorListParams): Promise<VendorListPage>;
  /** Active vendors assigned to the Project, by name. */
  listForProject(workspaceId: string, projectId: string): Promise<Vendor[]>;
  /** Inserts the vendor, its rate card and its opening entry (if not 0). */
  insert(vendor: Vendor, openingBalance: number, by: string): Promise<void>;
  /**
   * Compare-and-set on `updatedAt` (409 `VENDOR_CHANGED`); replaces the
   * Projects and rates, soft-deletes removed shifts. When the opening amount
   * or the joining date changed, reverses the opening entry and posts the
   * new one. `openingBalance` null keeps the current amount.
   */
  update(
    vendor: Vendor,
    expectedUpdatedAt: Date,
    openingBalance: number | null,
    by: string,
  ): Promise<void>;
  setActive(vendor: Vendor, by: string): Promise<void>;
  /**
   * Tombstones the vendor and reverses its opening entry; 409
   * `VENDOR_HAS_RECORDS` once it has attendance or wage payments.
   */
  delete(vendor: Vendor, by: string): Promise<void>;
  /** The live opening entries' sum, per vendor. */
  openingBalances(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, number>>;
  /** Sum of entries up to `on`, per vendor. */
  balances(
    workspaceId: string,
    ids: readonly string[],
    on: CalendarDate,
  ): Promise<Map<string, number>>;
  /** Today in the Company's time zone. */
  today(workspaceId: string): Promise<CalendarDate>;
};

export type VendorRateReadModel = {
  labourCategoryId: string;
  /** Null when the category was deleted from Masters. */
  labourCategoryName: string | null;
  ratePerDay: number;
  overtimePerHour: number;
};

export type VendorShiftReadModel = {
  id: string;
  name: string;
  startTime: string | null;
  endTime: string | null;
  rates: VendorRateReadModel[];
};

export type VendorProjectReadModel = { id: string; name: string };

export type VendorReadModel = {
  id: string;
  name: string;
  joiningDate: CalendarDate;
  contactNumber: string | null;
  address: string | null;
  isActive: boolean;
  hasRateCard: boolean;
  photoKey: string | null;
  projects: VendorProjectReadModel[];
  shifts: VendorShiftReadModel[];
  /** Paise. */
  openingBalance: number;
  /** Paise owed to the vendor at the end of today. */
  balance: number;
  createdAt: Date;
  updatedAt: Date;
};

export type VendorSummaryReadModel = {
  id: string;
  name: string;
  contactNumber: string | null;
  isActive: boolean;
  hasRateCard: boolean;
  shiftCount: number;
  projects: VendorProjectReadModel[];
  balance: number;
  createdAt: Date;
  updatedAt: Date;
};

export type VendorOptionReadModel = {
  id: string;
  name: string;
  hasRateCard: boolean;
  shifts: VendorShiftReadModel[];
};

export type VendorWriteInput = {
  workspaceId: string;
  details: VendorDetailsInput;
  projectIds: readonly string[];
  shifts: readonly VendorShiftInput[];
  by: string;
};

function sortedByName<T extends { name: string }>(items: T[]): T[] {
  const collator = new Intl.Collator("en", {
    sensitivity: "base",
    numeric: true,
  });
  return items.sort((a, b) => collator.compare(a.name, b.name));
}

function assertOpening(value: number | null): void {
  if (value != null && !Number.isSafeInteger(value))
    throw new DomainError(
      "VENDOR_OPENING_BALANCE_INVALID",
      "The opening balance is a whole number of paise.",
    );
}

/** Vendor register commands and queries (CM-208, CM-209). Access is checked by the caller. */
export class VendorHandlers {
  constructor(
    private readonly store: VendorStore,
    private readonly projects: ProjectDirectory,
    private readonly labourCategories: LabourCategoryDirectory,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async load(workspaceId: string, id: string): Promise<Vendor> {
    const found = await this.store.find(workspaceId, id);
    if (found == null)
      throw notFound("VENDOR_NOT_FOUND", "This Vendor was not found.");
    return found;
  }

  private async assertProjects(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<void> {
    const found = await this.projects.find(workspaceId, ids);
    const missing = ids.find((id) => !found.has(id));
    if (missing != null)
      throw new DomainError(
        "PROJECT_NOT_FOUND",
        "One of the Projects was not found. Reload and choose again.",
        { details: { projectId: missing } },
      );
  }

  /**
   * Categories new to the rate card must be live and enabled; ones already
   * on it stay even if Masters disabled them since.
   */
  private async assertCategories(
    workspaceId: string,
    shifts: readonly VendorShiftInput[],
    existing: ReadonlySet<string>,
  ): Promise<void> {
    const added = [
      ...new Set(
        shifts.flatMap((shift) =>
          shift.rates.map((rate) => rate.labourCategoryId),
        ),
      ),
    ].filter((id) => !existing.has(id));
    const found = await this.labourCategories.find(workspaceId, added);
    for (const id of added) {
      const category = found.get(id);
      if (category == null)
        throw new DomainError(
          "LABOUR_CATEGORY_NOT_FOUND",
          "One of the Labour Categories was not found. Reload and choose again.",
          { details: { labourCategoryId: id } },
        );
      if (category.disabled)
        throw new DomainError(
          "LABOUR_CATEGORY_DISABLED",
          `${category.name} is disabled in Masters, so it cannot be added to a rate card.`,
          { details: { labourCategoryId: id } },
        );
    }
  }

  private async readModels(
    workspaceId: string,
    vendors: readonly Vendor[],
  ): Promise<{
    projects: Map<string, VendorProjectReadModel>;
    categories: Map<string, { name: string }>;
  }> {
    const [projects, categories] = await Promise.all([
      this.projects.find(
        workspaceId,
        vendors.flatMap((vendor) => vendor.projectIds),
      ),
      this.labourCategories.find(workspaceId, [
        ...new Set(vendors.flatMap((vendor) => [...vendor.categoryIds])),
      ]),
    ]);
    return { projects, categories };
  }

  private shiftsOf(
    vendor: Vendor,
    categories: Map<string, { name: string }>,
  ): VendorShiftReadModel[] {
    return vendor.shifts.map((shift) => ({
      id: shift.id,
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      rates: shift.rates.map((rate) => ({
        ...rate,
        labourCategoryName: categories.get(rate.labourCategoryId)?.name ?? null,
      })),
    }));
  }

  private projectsOf(
    vendor: Vendor,
    projects: Map<string, VendorProjectReadModel>,
  ): VendorProjectReadModel[] {
    return sortedByName(
      vendor.projectIds.flatMap((id) => {
        const project = projects.get(id);
        return project == null ? [] : [{ id: project.id, name: project.name }];
      }),
    );
  }

  async get(workspaceId: string, id: string): Promise<VendorReadModel> {
    const vendor = await this.load(workspaceId, id);
    const [{ projects, categories }, openings, balances] = await Promise.all([
      this.readModels(workspaceId, [vendor]),
      this.store.openingBalances(workspaceId, [vendor.id]),
      this.store
        .today(workspaceId)
        .then((today) => this.store.balances(workspaceId, [vendor.id], today)),
    ]);
    return {
      id: vendor.id,
      name: vendor.name,
      joiningDate: vendor.joiningDate,
      contactNumber: vendor.contactNumber,
      address: vendor.address,
      isActive: vendor.isActive,
      hasRateCard: vendor.hasRateCard,
      photoKey: vendor.photoKey,
      projects: this.projectsOf(vendor, projects),
      shifts: this.shiftsOf(vendor, categories),
      openingBalance: openings.get(vendor.id) ?? 0,
      balance: balances.get(vendor.id) ?? 0,
      createdAt: vendor.createdAt,
      updatedAt: vendor.updatedAt,
    };
  }

  async list(params: VendorListParams): Promise<{
    items: VendorSummaryReadModel[];
    total: number;
    hasMore: boolean;
  }> {
    const page = await this.store.list(params);
    const ids = page.items.map((vendor) => vendor.id);
    const today = await this.store.today(params.workspaceId);
    const [projects, balances] = await Promise.all([
      this.projects.find(
        params.workspaceId,
        page.items.flatMap((vendor) => vendor.projectIds),
      ),
      this.store.balances(params.workspaceId, ids, today),
    ]);
    return {
      items: page.items.map((vendor) => ({
        id: vendor.id,
        name: vendor.name,
        contactNumber: vendor.contactNumber,
        isActive: vendor.isActive,
        hasRateCard: vendor.hasRateCard,
        shiftCount: vendor.shifts.length,
        projects: this.projectsOf(vendor, projects),
        balance: balances.get(vendor.id) ?? 0,
        createdAt: vendor.createdAt,
        updatedAt: vendor.updatedAt,
      })),
      total: page.total,
      hasMore: page.hasMore,
    };
  }

  /** Active vendors on a Project, with live shifts, for attendance (CM-213). */
  async options(
    workspaceId: string,
    projectId: string,
  ): Promise<VendorOptionReadModel[]> {
    const project = await this.projects.find(workspaceId, [projectId]);
    if (!project.has(projectId))
      throw notFound("PROJECT_NOT_FOUND", "This Project was not found.");
    const vendors = await this.store.listForProject(workspaceId, projectId);
    const { categories } = await this.readModels(workspaceId, vendors);
    return vendors.map((vendor) => ({
      id: vendor.id,
      name: vendor.name,
      hasRateCard: vendor.hasRateCard,
      shifts: this.shiftsOf(vendor, categories),
    }));
  }

  async create(
    input: VendorWriteInput & { openingBalance: number | null },
  ): Promise<VendorReadModel> {
    assertOpening(input.openingBalance);
    await this.assertProjects(input.workspaceId, input.projectIds);
    await this.assertCategories(input.workspaceId, input.shifts, new Set());
    const now = this.clock();
    const vendor = Vendor.create({
      id: newId(now.getTime()),
      workspaceId: input.workspaceId,
      details: input.details,
      projectIds: input.projectIds,
      shifts: input.shifts,
      newShiftId: () => newId(now.getTime()),
      by: input.by,
      now,
    });
    await this.store.insert(vendor, input.openingBalance ?? 0, input.by);
    return this.get(input.workspaceId, vendor.id);
  }

  async update(
    input: VendorWriteInput & {
      id: string;
      expectedUpdatedAt: Date;
      /** Null keeps the current opening balance. */
      openingBalance: number | null;
    },
  ): Promise<VendorReadModel> {
    assertOpening(input.openingBalance);
    const vendor = await this.load(input.workspaceId, input.id);
    await this.assertProjects(input.workspaceId, input.projectIds);
    await this.assertCategories(
      input.workspaceId,
      input.shifts,
      vendor.categoryIds,
    );
    const now = this.clock();
    vendor.update({
      details: input.details,
      projectIds: input.projectIds,
      shifts: input.shifts,
      newShiftId: () => newId(now.getTime()),
      by: input.by,
      now,
    });
    await this.store.update(
      vendor,
      input.expectedUpdatedAt,
      input.openingBalance,
      input.by,
    );
    return this.get(input.workspaceId, vendor.id);
  }

  async setActive(input: {
    workspaceId: string;
    id: string;
    isActive: boolean;
    by: string;
  }): Promise<VendorReadModel> {
    const vendor = await this.load(input.workspaceId, input.id);
    if (vendor.isActive !== input.isActive) {
      vendor.setActive(input.isActive, input.by, this.clock());
      await this.store.setActive(vendor, input.by);
    }
    return this.get(input.workspaceId, vendor.id);
  }

  async delete(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<void> {
    const vendor = await this.load(input.workspaceId, input.id);
    vendor.delete(input.by, this.clock());
    await this.store.delete(vendor, input.by);
  }
}
