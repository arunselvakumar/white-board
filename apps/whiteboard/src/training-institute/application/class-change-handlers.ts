import { ClassChange, moveTarget } from "../domain/class-change";
import {
  classesOn,
  hasStarted,
  holidayOn,
  localNow,
  type ClassChangeFact,
  type ClassSlotTime,
  type HolidayFact,
  type LocalNow,
  type ScheduledClass,
  type ScheduleSource,
} from "../domain/class-schedule";
import { DomainError } from "../domain/errors";
import { Holiday } from "../domain/holiday";

export type ClassExceptions = {
  changes: ClassChangeFact[];
  holidays: HolidayFact[];
};

/** Active Class Changes for some Batches and the Workspace's Holidays. */
export type ClassExceptionsReader = {
  forBatches(
    workspaceId: string,
    batchIds: readonly string[],
  ): Promise<ClassExceptions>;
};

export type ScheduleActor = {
  workspaceId: string;
  userId: string;
  role: "owner" | "teacher";
};

export type ClassSlotKey = { batchId: string; date: string; startTime: string };

export type ChangeableBatch = {
  id: string;
  timezone: string;
  closed: boolean;
  /** Batch Timings first, then each active Student-specific Timing. */
  sources: (ScheduleSource & { enrollmentId?: string })[];
};

export type ClassChangeStore = {
  /**
   * Runs `work` in one transaction holding this Batch's schedule lock (and a
   * shared Workspace schedule lock), so checks and writes can't interleave
   * with another change, a Holiday, or a Register save.
   */
  withBatchLock<T>(
    workspaceId: string,
    batchId: string,
    work: (store: ClassChangeStore) => Promise<T>,
  ): Promise<T>;
  /** Like `withBatchLock`, but exclusive across the Workspace (Holidays). */
  withWorkspaceLock<T>(
    workspaceId: string,
    work: (store: ClassChangeStore) => Promise<T>,
  ): Promise<T>;
  findBatch(
    workspaceId: string,
    batchId: string,
  ): Promise<ChangeableBatch | null>;
  openBatches(workspaceId: string): Promise<ChangeableBatch[]>;
  isAssignedTeacher(
    workspaceId: string,
    batchId: string,
    userId: string,
  ): Promise<boolean>;
  activeChanges(workspaceId: string, batchId?: string): Promise<ClassChange[]>;
  activeHolidays(workspaceId: string): Promise<Holiday[]>;
  findHoliday(workspaceId: string, id: string): Promise<Holiday | null>;
  /**
   * True when a Register on one of these dates has a Mark other than Unmarked.
   * Locks those Registers, so a concurrent Attendance save waits or is seen.
   */
  hasSavedAttendance(
    workspaceId: string,
    batchId: string | null,
    dates: { from: string; to: string },
  ): Promise<boolean>;
  hasOccurrence(workspaceId: string, slot: ClassSlotKey): Promise<boolean>;
  /** Saves the change and tombstones Unmarked-only Registers on the given dates. */
  saveChange(change: ClassChange, emptyRegisterDates: string[]): Promise<void>;
  saveHoliday(
    holiday: Holiday,
    emptyRegisterDates?: { from: string; to: string },
  ): Promise<void>;
};

function classesAt(
  batch: ChangeableBatch,
  date: string,
  changes: readonly ClassChangeFact[],
  holidays: readonly HolidayFact[],
): ScheduledClass[] {
  return batch.sources.flatMap((source) =>
    classesOn(source, date, changes, holidays),
  );
}

/** The Class a User sees at this key: a Rescheduled slot or an original one. */
export function findClass(
  batch: ChangeableBatch,
  key: { date: string; startTime: string },
  changes: readonly ClassChangeFact[],
  holidays: readonly HolidayFact[],
): ScheduledClass | null {
  const matches = classesAt(batch, key.date, changes, holidays).filter(
    (scheduled) => scheduled.startTime === key.startTime,
  );
  return (
    matches.find((scheduled) => scheduled.rescheduled) ??
    matches.find((scheduled) => scheduled.status === "scheduled") ??
    matches[0] ??
    null
  );
}

function hasScheduledClass(
  batch: ChangeableBatch,
  date: string,
  changes: readonly ClassChangeFact[],
  holidays: readonly HolidayFact[],
): boolean {
  return classesAt(batch, date, changes, holidays).some(
    (scheduled) => scheduled.status === "scheduled",
  );
}

/**
 * The latest local date across these timezones. A Holiday starting on or after
 * it can't touch a day that is already over for any Batch.
 */
export function latestToday(now: Date, timezones: string[]): string {
  const dates = timezones.map((timezone) => localNow(now, timezone).date);
  // No open Batches means no Classes to protect; UTC is fine then.
  return dates.length > 0
    ? dates.reduce((max, date) => (date > max ? date : max))
    : now.toISOString().slice(0, 10);
}

export class ClassChangeHandlers {
  constructor(
    private readonly deps: {
      store: ClassChangeStore;
      now: () => Date;
      /** Set on the copy that runs inside a schedule lock. */
      locked?: boolean;
    },
  ) {}

  /** The same handlers, running against a store bound to a locked transaction. */
  private within(store: ClassChangeStore): ClassChangeHandlers {
    return new ClassChangeHandlers({ ...this.deps, store, locked: true });
  }

  async cancel(
    actor: ScheduleActor,
    key: ClassSlotKey,
    input: { reason?: string | null },
  ): Promise<ClassChangeFact> {
    if (!this.deps.locked)
      return this.deps.store.withBatchLock(
        actor.workspaceId,
        key.batchId,
        (store) => this.within(store).cancel(actor, key, input),
      );
    const ctx = await this.context(actor, key);
    const { found, batch, now, local } = ctx;
    if (found.rescheduled && found.change != null) {
      const change = ctx.changeFor(found.change);
      await this.assertSlotOpen(actor, batch, found, local);
      change.cancelInstead({
        ...input,
        userId: actor.userId,
        now,
        localNow: local,
      });
      return this.save(ctx, change, [found.date]);
    }
    if (found.status === "cancelled")
      throw new DomainError(
        "CLASS_ALREADY_CANCELLED",
        "This Class is already cancelled.",
      );
    if (found.status === "holiday")
      throw new DomainError(
        "CLASS_ON_HOLIDAY",
        "This Class is already off for a Holiday.",
      );
    if (found.status === "moved")
      throw new DomainError(
        "CLASS_ALREADY_MOVED",
        "This Class has moved. Cancel it at its new time, or restore it first.",
      );
    await this.assertSlotOpen(actor, batch, found, local);
    const change = ClassChange.cancel(
      {
        id: crypto.randomUUID(),
        workspaceId: actor.workspaceId,
        batchId: batch.id,
        date: found.date,
        startTime: found.startTime,
        endTime: found.endTime,
      },
      { ...input, userId: actor.userId, now },
    );
    return this.save(ctx, change, [found.date]);
  }

  async move(
    actor: ScheduleActor,
    key: ClassSlotKey,
    input: { to: ClassSlotTime; reason?: string | null },
  ): Promise<ClassChangeFact> {
    if (!this.deps.locked)
      return this.deps.store.withBatchLock(
        actor.workspaceId,
        key.batchId,
        (store) => this.within(store).move(actor, key, input),
      );
    const ctx = await this.context(actor, key);
    const { found, batch, now, local, changes, holidays } = ctx;
    if (found.status === "moved" && !found.rescheduled)
      throw new DomainError(
        "CLASS_ALREADY_MOVED",
        "This Class has moved. Move it from its new time, or restore it first.",
      );
    moveTarget(found.change ?? found, input.to, local);
    await this.assertSlotOpen(actor, batch, found, local);
    if (holidayOn(holidays, input.to.date) != null)
      throw new DomainError(
        "CLASS_MOVE_TO_HOLIDAY",
        "The new date is a Holiday.",
      );
    const taken = classesAt(batch, input.to.date, changes, holidays).some(
      (scheduled) =>
        scheduled.startTime === input.to.startTime &&
        // Moving a Class again may land back on its own Rescheduled slot.
        !(found.change != null && scheduled.change?.id === found.change.id),
    );
    if (taken)
      throw new DomainError(
        "CLASS_MOVE_TARGET_TAKEN",
        "This Batch already has a Class at that date and start time.",
      );
    const existing = found.change == null ? null : ctx.changeFor(found.change);
    const change =
      existing ??
      ClassChange.move(
        {
          id: crypto.randomUUID(),
          workspaceId: actor.workspaceId,
          batchId: batch.id,
          date: found.date,
          startTime: found.startTime,
          endTime: found.endTime,
        },
        { ...input, userId: actor.userId, now, localNow: local },
      );
    if (existing != null)
      existing.moveAgain({
        ...input,
        userId: actor.userId,
        now,
        localNow: local,
      });
    return this.save(ctx, change, [found.date]);
  }

  async restore(actor: ScheduleActor, key: ClassSlotKey): Promise<void> {
    if (!this.deps.locked)
      return this.deps.store.withBatchLock(
        actor.workspaceId,
        key.batchId,
        (store) => this.within(store).restore(actor, key),
      );
    const ctx = await this.context(actor, key);
    const { found, batch, now, local } = ctx;
    if (found.change == null)
      throw new DomainError(
        "CLASS_NOT_CHANGED",
        "This Class hasn't been cancelled or moved.",
      );
    const change = ctx.changeFor(found.change);
    const movedTo = change.movedTo;
    if (movedTo != null)
      await this.assertSlotOpen(
        actor,
        batch,
        { batchId: batch.id, ...movedTo },
        local,
      );
    change.restore({ userId: actor.userId, now, localNow: local });
    await this.deps.store.saveChange(
      change,
      movedTo != null &&
        !hasScheduledClass(
          batch,
          movedTo.date,
          ctx.changes.filter((fact) => fact.id !== change.id),
          ctx.holidays,
        )
        ? [movedTo.date]
        : [],
    );
  }

  async declareHoliday(
    actor: ScheduleActor,
    input: { startDate: string; endDate: string; reason?: string | null },
  ): Promise<HolidayFact> {
    this.assertOwner(actor);
    if (!this.deps.locked)
      return this.deps.store.withWorkspaceLock(actor.workspaceId, (store) =>
        this.within(store).declareHoliday(actor, input),
      );
    const now = this.deps.now();
    const batches = await this.deps.store.openBatches(actor.workspaceId);
    const holiday = Holiday.declare({
      id: crypto.randomUUID(),
      workspaceId: actor.workspaceId,
      ...input,
      userId: actor.userId,
      now,
      today: latestToday(
        now,
        batches.map((batch) => batch.timezone),
      ),
    });
    const existing = await this.deps.store.activeHolidays(actor.workspaceId);
    if (existing.some((other) => holiday.overlaps(other)))
      throw new DomainError(
        "HOLIDAY_OVERLAPS",
        "These dates overlap another Holiday.",
      );
    const range = { from: holiday.startDate, to: holiday.endDate };
    const changes = (
      await this.deps.store.activeChanges(actor.workspaceId)
    ).map((change) => change.toFact());
    for (const batch of batches) {
      const local = localNow(now, batch.timezone);
      if (local.date < range.from || local.date > range.to) continue;
      for (const scheduled of classesAt(batch, local.date, changes, [])) {
        if (scheduled.status !== "scheduled") continue;
        if (
          hasStarted(scheduled, local) ||
          (await this.deps.store.hasOccurrence(actor.workspaceId, scheduled))
        )
          throw heldClassConflict();
      }
    }
    if (
      await this.deps.store.hasSavedAttendance(actor.workspaceId, null, range)
    )
      throw heldClassConflict();
    await this.deps.store.saveHoliday(holiday, range);
    return holiday.toFact();
  }

  async removeHoliday(actor: ScheduleActor, id: string): Promise<void> {
    this.assertOwner(actor);
    if (!this.deps.locked)
      return this.deps.store.withWorkspaceLock(actor.workspaceId, (store) =>
        this.within(store).removeHoliday(actor, id),
      );
    const holiday = await this.deps.store.findHoliday(actor.workspaceId, id);
    if (holiday == null)
      throw new DomainError("HOLIDAY_NOT_FOUND", "Holiday not found.");
    const now = this.deps.now();
    const batches = await this.deps.store.openBatches(actor.workspaceId);
    holiday.remove({
      userId: actor.userId,
      now,
      today: latestToday(
        now,
        batches.map((batch) => batch.timezone),
      ),
    });
    await this.deps.store.saveHoliday(holiday);
  }

  private assertOwner(actor: ScheduleActor): void {
    if (actor.role !== "owner")
      throw new DomainError(
        "HOLIDAY_FORBIDDEN",
        "Only the Owner can manage Holidays.",
      );
  }

  private async context(actor: ScheduleActor, key: ClassSlotKey) {
    const store = this.deps.store;
    const batch = await store.findBatch(actor.workspaceId, key.batchId);
    if (
      batch == null ||
      (actor.role === "teacher" &&
        !(await store.isAssignedTeacher(
          actor.workspaceId,
          batch.id,
          actor.userId,
        )))
    )
      throw new DomainError("CLASS_NOT_FOUND", "Class not found.");
    if (batch.closed)
      throw new DomainError(
        "BATCH_CLOSED",
        "Classes of a closed Batch can't be changed.",
      );
    const [aggregates, holidayRows] = await Promise.all([
      store.activeChanges(actor.workspaceId, batch.id),
      store.activeHolidays(actor.workspaceId),
    ]);
    const changes = aggregates.map((change) => change.toFact());
    const holidays = holidayRows.map((holiday) => holiday.toFact());
    const found = findClass(batch, key, changes, holidays);
    if (found == null)
      throw new DomainError("CLASS_NOT_FOUND", "Class not found.");
    const now = this.deps.now();
    return {
      batch,
      found,
      changes,
      holidays,
      now,
      local: localNow(now, batch.timezone),
      changeFor(fact: ClassChangeFact): ClassChange {
        const change = aggregates.find((candidate) => candidate.id === fact.id);
        if (change == null)
          throw new DomainError("CLASS_NOT_FOUND", "Class not found.");
        return change;
      },
    };
  }

  /** A Class that has started, been hosted online, or has saved Attendance is final. */
  private async assertSlotOpen(
    actor: ScheduleActor,
    batch: ChangeableBatch,
    slot: { batchId: string; date: string; startTime: string },
    local: LocalNow,
  ): Promise<void> {
    if (
      hasStarted(slot, local) ||
      (await this.deps.store.hasOccurrence(actor.workspaceId, slot))
    )
      throw new DomainError(
        "CLASS_ALREADY_STARTED",
        "This Class has already started and can't be changed.",
      );
    if (
      await this.deps.store.hasSavedAttendance(actor.workspaceId, batch.id, {
        from: slot.date,
        to: slot.date,
      })
    )
      throw new DomainError(
        "CLASS_HAS_ATTENDANCE",
        "Attendance has been saved for this Class, so it can't be changed.",
      );
  }

  private async save(
    ctx: {
      batch: ChangeableBatch;
      changes: ClassChangeFact[];
      holidays: HolidayFact[];
    },
    change: ClassChange,
    dates: string[],
  ): Promise<ClassChangeFact> {
    const fact = change.toFact();
    const changes = [
      ...ctx.changes.filter((other) => other.id !== fact.id),
      fact,
    ];
    await this.deps.store.saveChange(
      change,
      dates.filter(
        (date) => !hasScheduledClass(ctx.batch, date, changes, ctx.holidays),
      ),
    );
    return fact;
  }
}

function heldClassConflict(): DomainError {
  return new DomainError(
    "HOLIDAY_CONFLICTS_WITH_HELD_CLASS",
    "Some Classes on these dates have already started or have saved Attendance. Cancel the remaining Classes one at a time, or start the Holiday tomorrow.",
  );
}
