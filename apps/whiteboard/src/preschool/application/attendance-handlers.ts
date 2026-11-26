import {
  assertEditableDay,
  canEditDay,
  checkIn,
  checkOut,
  clockTimeFor,
  collectedBy,
  countMarks,
  daysOfMonth,
  markStatus,
  undoCheckOut,
  type AttendanceMark,
  type AttendanceStatus,
  type CollectedByKind,
} from "../domain/attendance";
import { timeInIndia, todayInIndia, type IsoDate } from "../domain/dates";
import { assertManagerOf, type PreschoolActor } from "./access";
import {
  assertOnRoster,
  openClassroom,
  placeChild,
  readableChild,
} from "./attendance-access";
import type { AttendanceStore } from "./attendance-ports";
import type {
  AttendanceMarkView,
  AttendanceTotals,
  CentreAttendanceSummaryView,
  ChildAttendanceDayView,
  ChildAttendanceMonthView,
  ClassroomAttendanceMonthView,
  ClassroomAttendanceView,
} from "./attendance-views";

export type CheckOutInput = {
  childId: string;
  date?: IsoDate;
  time?: string;
  collectedByKind: CollectedByKind;
  pickupId?: string | null;
  collectedByName?: string | null;
  note?: string | null;
};

export function markView(mark: AttendanceMark): AttendanceMarkView {
  return {
    status: mark.status,
    checkInTime: mark.checkInTime,
    droppedBy: mark.droppedBy,
    checkOutTime: mark.checkOutTime,
    collectedBy:
      mark.collectedByKind == null || mark.collectedByName == null
        ? null
        : {
            kind: mark.collectedByKind,
            name: mark.collectedByName,
            pickupId: mark.collectedByPickupId,
          },
    note: mark.note,
  };
}

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function totalsOf(
  statuses: readonly (AttendanceStatus | null)[],
): AttendanceTotals {
  const totals = { present: 0, absent: 0, leave: 0 };
  for (const status of statuses) if (status != null) totals[status] += 1;
  return totals;
}

/** Check-in, check-out and the register (Owner, Centre Head, the Classroom's Teacher). */
export class AttendanceHandlers {
  constructor(
    private readonly deps: { store: AttendanceStore; now: () => Date },
  ) {}

  private clock() {
    const now = this.deps.now();
    return { today: todayInIndia(now), nowTime: timeInIndia(now) };
  }

  async day(
    actor: PreschoolActor,
    input: { classroomId: string; date?: IsoDate },
  ): Promise<ClassroomAttendanceView> {
    const { today } = this.clock();
    const date = input.date ?? today;
    const classroom = await openClassroom(
      this.deps.store,
      actor,
      input.classroomId,
    );
    const roster = await this.deps.store.roster(classroom.id, date);
    const marks = await this.deps.store.marks(
      roster.map((child) => child.childId),
      date,
    );
    return {
      classroom,
      date,
      editable: canEditDay(actor.role, date, today),
      counts: countMarks(roster.length, [...marks.values()]),
      children: roster.map((child) => {
        const mark = marks.get(child.childId);
        return { ...child, mark: mark == null ? null : markView(mark) };
      }),
    };
  }

  /** Sets many Children's status at once ("mark everyone present"). */
  async mark(
    actor: PreschoolActor,
    input: {
      classroomId: string;
      date?: IsoDate;
      marks: { childId: string; status: AttendanceStatus }[];
    },
  ): Promise<ClassroomAttendanceView> {
    const { today, nowTime } = this.clock();
    const date = input.date ?? today;
    assertEditableDay(actor.role, date, today);
    const classroom = await openClassroom(
      this.deps.store,
      actor,
      input.classroomId,
    );
    await this.deps.store.transaction(async (store) => {
      const roster = await store.roster(classroom.id, date);
      assertOnRoster(
        new Set(roster.map((child) => child.childId)),
        input.marks.map((mark) => mark.childId),
      );
      for (const { childId, status } of input.marks) {
        const existing = await store.lockMark(childId, date);
        await store.saveMark({
          workspaceId: actor.workspaceId,
          centreId: classroom.centreId,
          classroomId: classroom.id,
          childId,
          date,
          mark: markStatus(existing, status, {
            isToday: date === today,
            nowTime,
          }),
          markedByUserId: actor.userId,
        });
      }
    });
    return this.day(actor, { classroomId: classroom.id, date });
  }

  async checkIn(
    actor: PreschoolActor,
    input: {
      childId: string;
      date?: IsoDate;
      time?: string;
      droppedBy?: string | null;
    },
  ): Promise<ChildAttendanceDayView> {
    return this.changeDay(actor, input, (existing, day) =>
      checkIn(
        existing,
        clockTimeFor(input.time, day),
        textOrNull(input.droppedBy),
      ),
    );
  }

  async checkOut(
    actor: PreschoolActor,
    input: CheckOutInput,
  ): Promise<ChildAttendanceDayView> {
    return this.changeDay(actor, input, (existing, day, child) =>
      checkOut(
        existing,
        clockTimeFor(input.time, day),
        collectedBy(
          {
            kind: input.collectedByKind,
            pickupId: input.pickupId,
            name: input.collectedByName,
            note: input.note,
          },
          child,
        ),
      ),
    );
  }

  async undoCheckOut(
    actor: PreschoolActor,
    input: { childId: string; date?: IsoDate },
  ): Promise<ChildAttendanceDayView> {
    return this.changeDay(actor, input, (existing) => undoCheckOut(existing));
  }

  /** Removes the day's mark. */
  async clear(
    actor: PreschoolActor,
    input: { childId: string; date?: IsoDate },
  ): Promise<ChildAttendanceDayView> {
    return this.changeDay(actor, input, () => null);
  }

  async month(
    actor: PreschoolActor,
    input: { classroomId: string; month: string },
  ): Promise<ClassroomAttendanceMonthView> {
    const classroom = await openClassroom(
      this.deps.store,
      actor,
      input.classroomId,
    );
    const days = daysOfMonth(input.month);
    const first = days[0] ?? `${input.month}-01`;
    const last = days.at(-1) ?? first;
    const [roster, marks] = await Promise.all([
      this.deps.store.roster(classroom.id, last),
      this.deps.store.classroomMarks(classroom.id, first, last),
    ]);
    const names = new Map(roster.map((child) => [child.childId, child.name]));
    const leftIds = [
      ...new Set(
        marks.map((mark) => mark.childId).filter((id) => !names.has(id)),
      ),
    ];
    for (const [id, name] of await this.deps.store.childNames(leftIds))
      names.set(id, name);
    const byChildDay = new Map(
      marks.map((mark) => [`${mark.childId}|${mark.date}`, mark.status]),
    );
    const children = [...names.entries()]
      .map(([childId, name]) => {
        const statuses = days.map(
          (day) => byChildDay.get(`${childId}|${day}`) ?? null,
        );
        return {
          childId,
          name,
          days: statuses,
          totals: totalsOf(statuses),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      classroom,
      month: input.month,
      days,
      workingDays: new Set(marks.map((mark) => mark.date)).size,
      children,
    };
  }

  /** Per Classroom and in total, for the Centre Dashboard. Managers only. */
  async summary(
    actor: PreschoolActor,
    input: { centreId: string; date?: IsoDate },
  ): Promise<CentreAttendanceSummaryView> {
    assertManagerOf(actor, input.centreId);
    const date = input.date ?? this.clock().today;
    const classrooms = await this.deps.store.centreClassrooms(
      actor.workspaceId,
      input.centreId,
      date,
    );
    const rows = await Promise.all(
      classrooms.map(async (classroom) => {
        const roster = await this.deps.store.roster(classroom.id, date);
        const marks = await this.deps.store.marks(
          roster.map((child) => child.childId),
          date,
        );
        return {
          classroomId: classroom.id,
          name: classroom.name,
          ...countMarks(roster.length, [...marks.values()]),
        };
      }),
    );
    const totals = {
      rosterSize: 0,
      present: 0,
      absent: 0,
      leave: 0,
      notMarked: 0,
      checkedOut: 0,
    };
    for (const row of rows)
      for (const key of Object.keys(totals) as (keyof typeof totals)[])
        totals[key] += row[key];
    return { centreId: input.centreId, date, classrooms: rows, totals };
  }

  /** A Child's month: staff who may see the Child, and the Child's Parents. */
  async childMonth(
    actor: PreschoolActor,
    childId: string,
    month: string,
  ): Promise<ChildAttendanceMonthView> {
    const child = await readableChild(
      this.deps.store,
      actor,
      childId,
      this.clock().today,
    );
    const days = daysOfMonth(month);
    const first = days[0] ?? `${month}-01`;
    const marks = await this.deps.store.childMarks(
      childId,
      first,
      days.at(-1) ?? first,
    );
    const byDay = new Map(marks.map((entry) => [entry.date, entry.mark]));
    const rows = days.map((date) => {
      const mark = byDay.get(date);
      return {
        date,
        status: mark?.status ?? null,
        checkInTime: mark?.checkInTime ?? null,
        checkOutTime: mark?.checkOutTime ?? null,
        collectedByName: mark?.collectedByName ?? null,
        collectedByKind: mark?.collectedByKind ?? null,
      };
    });
    return {
      childId,
      name: child.name,
      month,
      days: rows,
      totals: totalsOf(rows.map((row) => row.status)),
    };
  }

  /**
   * One Child's day, changed under the same date and Classroom rules as the
   * register. `change` returning null removes the mark.
   */
  private async changeDay(
    actor: PreschoolActor,
    input: { childId: string; date?: IsoDate },
    change: (
      existing: AttendanceMark | null,
      day: { isToday: boolean; nowTime: string },
      child: Awaited<ReturnType<typeof placeChild>>["child"],
    ) => AttendanceMark | null,
  ): Promise<ChildAttendanceDayView> {
    const { today, nowTime } = this.clock();
    const date = input.date ?? today;
    assertEditableDay(actor.role, date, today);
    const { child, classroom } = await placeChild(
      this.deps.store,
      actor,
      input.childId,
      date,
    );
    const mark = await this.deps.store.transaction(async (store) => {
      const existing = await store.lockMark(child.childId, date);
      const next = change(
        existing,
        { isToday: date === today, nowTime },
        child,
      );
      if (next == null) await store.deleteMark(child.childId, date);
      else
        await store.saveMark({
          workspaceId: actor.workspaceId,
          centreId: classroom.centreId,
          classroomId: classroom.id,
          childId: child.childId,
          date,
          mark: next,
          markedByUserId: actor.userId,
        });
      return next;
    });
    return {
      childId: child.childId,
      date,
      mark: mark == null ? null : markView(mark),
    };
  }
}
