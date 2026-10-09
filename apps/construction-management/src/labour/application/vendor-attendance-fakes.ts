import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { conflict, DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import { liveEntries, reversalOf, type NewLedgerEntry } from "../domain/ledger";
import type { Vendor } from "../domain/vendor";
import { vendorDayLedgerEntries } from "../domain/vendor-attendance";
import type { LabourCategoryDirectory, ProjectDirectory } from "./directories";
import type {
  StoredVendorDay,
  VendorAttendanceActor,
  VendorAttendanceBackdatedGuard,
  VendorAttendanceStore,
  VendorDayListParams,
} from "./vendor-attendance-handlers";
import type { VendorStore } from "./vendor-handlers";

type FakeEntry = NewLedgerEntry & { id: string };

/** In-memory vendor attendance with a ledger, for handler tests (no Prisma). */
export class FakeVendorAttendanceStore implements VendorAttendanceStore {
  readonly days = new Map<string, StoredVendorDay & { deleted: boolean }>();
  readonly ledger: FakeEntry[] = [];
  readonly audits: string[] = [];
  vendors = new Map<string, string>();

  private live(): StoredVendorDay[] {
    return [...this.days.values()].filter((day) => !day.deleted);
  }

  /** Sum of a vendor's entries. */
  balance(vendorId: string): number {
    return this.ledger
      .filter((entry) => entry.partyId === vendorId)
      .reduce((sum, entry) => sum + entry.amount, 0);
  }

  findById(workspaceId: string, id: string): Promise<StoredVendorDay | null> {
    const day = this.days.get(id);
    return Promise.resolve(
      day == null || day.deleted || day.workspaceId !== workspaceId
        ? null
        : structuredClone(day),
    );
  }

  findDay(
    workspaceId: string,
    vendorId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<StoredVendorDay | null> {
    return Promise.resolve(
      this.live().find(
        (day) =>
          day.workspaceId === workspaceId &&
          day.vendorId === vendorId &&
          day.projectId === projectId &&
          day.date === date,
      ) ?? null,
    );
  }

  daysBetween(
    workspaceId: string,
    projectId: string,
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<StoredVendorDay[]> {
    return Promise.resolve(
      this.live()
        .filter(
          (day) =>
            day.workspaceId === workspaceId &&
            day.projectId === projectId &&
            day.date >= from &&
            day.date <= to,
        )
        .sort((a, b) => a.date.localeCompare(b.date)),
    );
  }

  list(
    params: VendorDayListParams,
  ): Promise<{ items: StoredVendorDay[]; total: number }> {
    const all = this.live()
      .filter(
        (day) =>
          day.workspaceId === params.workspaceId &&
          day.projectId === params.projectId &&
          (params.from == null || day.date >= params.from) &&
          (params.to == null || day.date <= params.to) &&
          (params.vendorId == null || day.vendorId === params.vendorId) &&
          (params.labourCategoryId == null ||
            day.lines.some(
              (line) => line.labourCategoryId === params.labourCategoryId,
            )),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
    const start = (params.page - 1) * params.pageSize;
    return Promise.resolve({
      items: all.slice(start, start + params.pageSize),
      total: all.length,
    });
  }

  private reverse(id: string): void {
    const entries = this.ledger
      .filter(
        (entry) =>
          entry.sourceType === "vendor_attendance" && entry.sourceId === id,
      )
      .map((entry) => ({ ...entry, partyType: entry.partyType }));
    for (const entry of liveEntries(entries))
      this.ledger.push({ ...reversalOf(entry), id: newId() });
  }

  save(input: Parameters<VendorAttendanceStore["save"]>[0]): Promise<void> {
    const existing = this.days.get(input.id);
    if (input.expectedUpdatedAt == null) {
      if (
        this.live().some(
          (day) =>
            day.vendorId === input.day.vendorId &&
            day.projectId === input.day.projectId &&
            day.date === input.day.date,
        )
      )
        return Promise.reject(
          conflict("VENDOR_ATTENDANCE_CHANGED", "Already recorded."),
        );
    } else if (
      existing == null ||
      existing.deleted ||
      existing.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()
    ) {
      return Promise.reject(
        conflict("VENDOR_ATTENDANCE_CHANGED", "Changed since you opened it."),
      );
    }
    this.days.set(input.id, {
      id: input.id,
      workspaceId: input.workspaceId,
      projectId: input.day.projectId,
      vendorId: input.day.vendorId,
      date: input.day.date,
      totalPay: input.day.totalPay,
      lines: input.day.lines,
      createdAt: existing?.createdAt ?? input.now,
      updatedAt: input.now,
      createdBy: existing?.createdBy ?? input.by,
      updatedBy: input.by,
      deleted: false,
    });
    this.reverse(input.id);
    for (const entry of vendorDayLedgerEntries(input.day, input.id))
      if (entry.amount !== 0) this.ledger.push({ ...entry, id: newId() });
    this.audits.push(
      existing == null
        ? "vendor_attendance.recorded"
        : "vendor_attendance.updated",
    );
    return Promise.resolve();
  }

  clear(input: Parameters<VendorAttendanceStore["clear"]>[0]): Promise<void> {
    const existing = this.days.get(input.day.id);
    if (
      existing == null ||
      existing.deleted ||
      (input.expectedUpdatedAt != null &&
        existing.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
    )
      return Promise.reject(
        conflict("VENDOR_ATTENDANCE_CHANGED", "Changed since you opened it."),
      );
    existing.deleted = true;
    this.reverse(existing.id);
    this.audits.push("vendor_attendance.cleared");
    return Promise.resolve();
  }

  vendorNames(
    _workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    return Promise.resolve(
      new Map(
        ids.flatMap((id) => {
          const name = this.vendors.get(id);
          return name == null ? [] : [[id, name] as const];
        }),
      ),
    );
  }
}

/** Vendors in memory, with a fixed "today". */
export function fakeVendorReader(
  vendors: Vendor[],
  today: CalendarDate,
): Pick<VendorStore, "find" | "listForProject" | "today"> {
  return {
    find: (_workspaceId, id) =>
      Promise.resolve(vendors.find((vendor) => vendor.id === id) ?? null),
    listForProject: (_workspaceId, projectId) =>
      Promise.resolve(
        vendors.filter(
          (vendor) => vendor.isActive && vendor.projectIds.includes(projectId),
        ),
      ),
    today: () => Promise.resolve(today),
  };
}

export function fakeLookup(
  names: Record<string, string>,
): ProjectDirectory & LabourCategoryDirectory {
  return {
    find: (_workspaceId: string, ids: readonly string[]) =>
      Promise.resolve(
        new Map(
          ids
            .filter((id) => id in names)
            .map((id) => [id, { id, name: names[id] ?? id, disabled: false }]),
        ),
      ),
  };
}

/** Refuses creates and edits dated before `oldest` for members; records the checks. */
export class FakeBackdatedGuard implements VendorAttendanceBackdatedGuard {
  readonly checks: { action: "create" | "edit"; date: CalendarDate }[] = [];
  oldest: CalendarDate | null = null;

  assert(
    action: "create" | "edit",
    actor: VendorAttendanceActor,
    date: CalendarDate,
  ): Promise<void> {
    this.checks.push({ action, date });
    if (this.oldest != null && actor.role !== "owner" && date < this.oldest)
      return Promise.reject(
        new DomainError(
          action === "create"
            ? "BACKDATED_CREATE_BLOCKED"
            : "BACKDATED_EDIT_BLOCKED",
          "Too old.",
          { kind: "forbidden" },
        ),
      );
    return Promise.resolve();
  }
}
