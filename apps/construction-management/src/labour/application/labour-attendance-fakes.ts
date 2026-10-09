import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { conflict, DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import { dayLedgerEntries } from "../domain/labour-attendance";
import { liveEntries, reversalOf, type NewLedgerEntry } from "../domain/ledger";
import type {
  AttendanceLabourer,
  LabourAttendanceActor,
  LabourAttendanceBackdatedGuard,
  LabourAttendanceStore,
  LabourDayListParams,
  StoredLabourDay,
} from "./labour-attendance-handlers";

type FakeEntry = NewLedgerEntry & { id: string };

/** In-memory labour attendance with a ledger, for handler tests (no Prisma). */
export class FakeLabourAttendanceStore implements LabourAttendanceStore {
  readonly days = new Map<string, StoredLabourDay & { deleted: boolean }>();
  readonly ledger: FakeEntry[] = [];
  readonly audits: string[] = [];
  readonly people = new Map<string, AttendanceLabourer>();
  /** labourId → (date from, projectId), oldest first. */
  readonly history = new Map<
    string,
    { from: CalendarDate; projectId: string }[]
  >();
  categories: { id: string; name: string }[] = [];

  constructor(private readonly todayIs: CalendarDate) {}

  add(
    labourer: AttendanceLabourer,
    projectId: string,
    from: CalendarDate,
  ): void {
    this.people.set(labourer.id, labourer);
    this.history.set(labourer.id, [{ from, projectId }]);
  }

  transfer(labourId: string, projectId: string, from: CalendarDate): void {
    this.history.get(labourId)?.push({ from, projectId });
  }

  balance(labourId: string): number {
    return this.ledger
      .filter((entry) => entry.partyId === labourId)
      .reduce((sum, entry) => sum + entry.amount, 0);
  }

  private live(): StoredLabourDay[] {
    return [...this.days.values()].filter((day) => !day.deleted);
  }

  private on(labourId: string, date: CalendarDate): string | null {
    let found: string | null = null;
    for (const row of this.history.get(labourId) ?? [])
      if (row.from <= date) found = row.projectId;
    return found;
  }

  today(): Promise<CalendarDate> {
    return Promise.resolve(this.todayIs);
  }

  labourers(
    _workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, AttendanceLabourer>> {
    const result = new Map<string, AttendanceLabourer>();
    for (const id of ids) {
      const found = this.people.get(id);
      if (found != null) result.set(id, structuredClone(found));
    }
    return Promise.resolve(result);
  }

  projectsOn(
    _workspaceId: string,
    ids: readonly string[],
    date: CalendarDate,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const id of ids) {
      const on = this.on(id, date);
      if (on != null) result.set(id, on);
    }
    return Promise.resolve(result);
  }

  labourersOn(
    _workspaceId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<AttendanceLabourer[]> {
    return Promise.resolve(
      [...this.people.values()]
        .filter((item) => item.isActive && this.on(item.id, date) === projectId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  daysOf(
    workspaceId: string,
    labourIds: readonly string[],
    date: CalendarDate,
  ): Promise<StoredLabourDay[]> {
    return Promise.resolve(
      this.live()
        .filter(
          (day) =>
            day.workspaceId === workspaceId &&
            labourIds.includes(day.labourId) &&
            day.date === date,
        )
        .map((day) => structuredClone(day)),
    );
  }

  findById(workspaceId: string, id: string): Promise<StoredLabourDay | null> {
    const day = this.days.get(id);
    return Promise.resolve(
      day == null || day.deleted || day.workspaceId !== workspaceId
        ? null
        : structuredClone(day),
    );
  }

  daysBetween(
    workspaceId: string,
    projectId: string,
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<StoredLabourDay[]> {
    return Promise.resolve(
      this.live()
        .filter(
          (day) =>
            day.workspaceId === workspaceId &&
            day.projectId === projectId &&
            day.date >= from &&
            day.date <= to,
        )
        .sort(
          (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
        )
        .map((day) => structuredClone(day)),
    );
  }

  list(
    params: LabourDayListParams,
  ): Promise<{ items: StoredLabourDay[]; total: number; hasMore: boolean }> {
    const matches = this.live()
      .filter(
        (day) =>
          day.workspaceId === params.workspaceId &&
          day.projectId === params.projectId &&
          (params.from == null || day.date >= params.from) &&
          (params.to == null || day.date <= params.to) &&
          (params.labourId == null || day.labourId === params.labourId) &&
          (params.supervisorId == null ||
            day.supervisorId === params.supervisorId) &&
          (params.status == null ||
            (params.status === "paid_leave"
              ? day.status === "on_leave" && day.isPaidLeave
              : day.status === params.status)),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const items = matches.slice(0, params.limit);
    return Promise.resolve({
      items: structuredClone(items),
      total: matches.length,
      hasMore: matches.length > params.limit,
    });
  }

  private post(entries: NewLedgerEntry[]): void {
    for (const entry of entries)
      if (entry.amount !== 0) this.ledger.push({ ...entry, id: newId() });
  }

  private reverse(sourceId: string): void {
    const own = this.ledger
      .filter((entry) => entry.sourceId === sourceId)
      .map((entry) => ({ ...entry, entryDate: entry.entryDate }));
    this.post(liveEntries(own).map((entry) => reversalOf(entry)));
  }

  save(input: Parameters<LabourAttendanceStore["save"]>[0]): Promise<void> {
    // Validate everything first: all or none.
    for (const write of input.writes) {
      const row = this.days.get(write.id);
      if (write.expectedUpdatedAt == null) {
        const clash = this.live().find(
          (day) =>
            day.labourId === write.day.labourId && day.date === write.day.date,
        );
        if (clash != null)
          throw conflict("ATTENDANCE_CHANGED", "Changed.", {
            labourId: write.day.labourId,
          });
      } else if (
        row == null ||
        row.deleted ||
        row.updatedAt.getTime() !== write.expectedUpdatedAt.getTime()
      )
        throw conflict("ATTENDANCE_CHANGED", "Changed.", {
          labourId: write.day.labourId,
        });
    }
    for (const write of input.writes) {
      const row = this.days.get(write.id);
      this.days.set(write.id, {
        ...structuredClone(write.day),
        id: write.id,
        workspaceId: input.workspaceId,
        createdAt: row?.createdAt ?? input.now,
        createdBy: row?.createdBy ?? input.by,
        updatedAt: input.now,
        updatedBy: input.by,
        deleted: false,
      });
      this.reverse(write.id);
      this.post(dayLedgerEntries(write.day, write.id));
      this.audits.push(
        input.reason === "paid_leave"
          ? "labour_attendance.paid_leave_changed"
          : row == null
            ? "labour_attendance.marked"
            : "labour_attendance.updated",
      );
    }
    return Promise.resolve();
  }

  clear(input: Parameters<LabourAttendanceStore["clear"]>[0]): Promise<void> {
    for (const { day, expectedUpdatedAt } of input.days) {
      const row = this.days.get(day.id);
      if (
        row == null ||
        row.deleted ||
        row.updatedAt.getTime() !== expectedUpdatedAt.getTime()
      )
        throw conflict("ATTENDANCE_CHANGED", "Changed.", {
          labourId: day.labourId,
        });
    }
    for (const { day } of input.days) {
      const row = this.days.get(day.id);
      if (row == null) continue;
      row.deleted = true;
      this.reverse(day.id);
      this.audits.push("labour_attendance.cleared");
    }
    return Promise.resolve();
  }

  labourNames(
    _workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, { name: string; labourCode: string | null }>> {
    const result = new Map<
      string,
      { name: string; labourCode: string | null }
    >();
    for (const id of ids) {
      const found = this.people.get(id);
      if (found != null)
        result.set(id, { name: found.name, labourCode: found.labourCode });
    }
    return Promise.resolve(result);
  }

  categoryOptions(): Promise<{ id: string; name: string }[]> {
    return Promise.resolve(this.categories);
  }
}

/** Records every check; `refuse` makes a check throw like the kernel guard. */
export class FakeLabourBackdatedGuard implements LabourAttendanceBackdatedGuard {
  readonly checks: { action: "create" | "edit"; date: CalendarDate }[] = [];
  refuse: "create" | "edit" | null = null;

  assert(
    action: "create" | "edit",
    _actor: LabourAttendanceActor,
    date: CalendarDate,
  ): Promise<void> {
    this.checks.push({ action, date });
    if (this.refuse === action)
      throw new DomainError(
        action === "create"
          ? "BACKDATED_CREATE_BLOCKED"
          : "BACKDATED_EDIT_BLOCKED",
        "Too old.",
        { kind: "forbidden" },
      );
    return Promise.resolve();
  }
}

/** A directory over a fixed id → name table (Projects, categories, supervisors). */
export function fakeDirectory(names: Record<string, string>) {
  return {
    find: (_workspaceId: string, ids: readonly string[]) =>
      Promise.resolve(
        new Map(
          ids
            .filter((id) => names[id] != null)
            .map((id) => [id, { id, name: names[id] ?? "", disabled: false }]),
        ),
      ),
  };
}
