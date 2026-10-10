import { assertCan, type MemberAccess } from "@/src/shared-kernel/access";
import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import type { AssignmentSpan } from "../domain/effective-shift";
import type { EmployeeDirectory, HrmsEmployee, MonthLock } from "./ports";
import type {
  RotationTemplateStore,
  ShiftTemplateStore,
} from "./shift-template-handlers";

/** A stored assignment with the template it names. */
export type StoredAssignment = AssignmentSpan & {
  memberId: string;
  /** The shift's or rotation's name. */
  templateName: string;
  createdAt: Date;
  createdBy: string;
};

export type ShiftAssignmentStore = {
  /** Live assignments of the Company's members, newest start first per member. */
  list(workspaceId: string): Promise<StoredAssignment[]>;
  /**
   * Assigns one template to every member from `effectiveFrom`, in one
   * transaction, each audited: per member, under a lock, plans with
   * `planAssignment` (closing the open one the day before, or replacing
   * one starting the same day) and inserts. 400
   * `SHIFT_ASSIGNMENT_BEFORE_LATEST` (with `details.memberIds`) when a
   * member already has a later start; 409 `SHIFT_TEMPLATE_NOT_FOUND` /
   * `ROTATION_TEMPLATE_NOT_FOUND` if the template went meanwhile; 409
   * `SHIFT_ASSIGNMENT_CHANGED` if another assignment raced this one.
   */
  assign(input: {
    workspaceId: string;
    memberIds: readonly string[];
    template: { kind: "shift" | "rotation"; id: string };
    effectiveFrom: CalendarDate;
    by: string;
    now: Date;
  }): Promise<StoredAssignment[]>;
};

/** A member with their assignment in force today and their history. */
export type MemberAssignments = {
  employee: HrmsEmployee;
  /** In force on `today`, or null (the Settings day applies). */
  current: StoredAssignment | null;
  /** Starts after `today`, if one is planned. */
  upcoming: StoredAssignment | null;
  /** Every assignment, newest start first. */
  history: StoredAssignment[];
};

function covers(span: AssignmentSpan, date: CalendarDate): boolean {
  return (
    span.effectiveFrom <= date &&
    (span.effectiveTo == null || span.effectiveTo >= date)
  );
}

/**
 * Shift Management (CM-307): who works which shift or rotation, "until
 * changed". Menu `hrms.shifts`: `read` to list, `create` to assign.
 */
export class ShiftAssignmentHandlers {
  constructor(
    private readonly store: ShiftAssignmentStore,
    private readonly shifts: ShiftTemplateStore,
    private readonly rotations: RotationTemplateStore,
    private readonly employees: EmployeeDirectory,
    private readonly monthLock: MonthLock,
    private readonly today: (workspaceId: string) => Promise<CalendarDate>,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Every Team Member with their current, upcoming and past assignments. */
  async list(input: {
    access: MemberAccess;
    memberId?: string;
  }): Promise<{ today: CalendarDate; members: MemberAssignments[] }> {
    assertCan(input.access, "hrms.shifts", "read");
    const { workspaceId } = input.access;
    const [employees, assignments, today] = await Promise.all([
      this.employees.list(workspaceId),
      this.store.list(workspaceId),
      this.today(workspaceId),
    ]);
    const byMember = new Map<string, StoredAssignment[]>();
    for (const assignment of assignments) {
      const list = byMember.get(assignment.memberId) ?? [];
      list.push(assignment);
      byMember.set(assignment.memberId, list);
    }
    const members = employees
      .filter(
        (employee) =>
          input.memberId == null || employee.memberId === input.memberId,
      )
      .map((employee) => {
        const history = (byMember.get(employee.memberId) ?? []).sort((a, b) =>
          b.effectiveFrom.localeCompare(a.effectiveFrom),
        );
        return {
          employee,
          current: history.find((span) => covers(span, today)) ?? null,
          upcoming: history.find((span) => span.effectiveFrom > today) ?? null,
          history,
        };
      });
    return { today, members };
  }

  /**
   * Assigns a shift template or a rotation template to many members from
   * a date, until changed. The template must be active; every member must
   * be a live Team Member; no member's month of `effectiveFrom` may be
   * closed by an approved salary (409 `MONTH_LOCKED`).
   */
  async assign(input: {
    access: MemberAccess;
    memberIds: readonly string[];
    shiftTemplateId: string | null;
    rotationTemplateId: string | null;
    effectiveFrom: string;
  }): Promise<StoredAssignment[]> {
    assertCan(input.access, "hrms.shifts", "create");
    const { workspaceId, userId } = input.access;
    const memberIds = [...new Set(input.memberIds)];
    if (memberIds.length === 0)
      throw new DomainError(
        "SHIFT_ASSIGNMENT_MEMBERS_REQUIRED",
        "Choose at least one Team Member.",
        { details: { field: "memberIds" } },
      );
    if ((input.shiftTemplateId == null) === (input.rotationTemplateId == null))
      throw new DomainError(
        "SHIFT_ASSIGNMENT_TEMPLATE_REQUIRED",
        "Choose a shift or a rotation.",
        { details: { field: "template" } },
      );
    const effectiveFrom = assertCalendarDate(
      input.effectiveFrom,
      "SHIFT_ASSIGNMENT_DATE_INVALID",
    );

    const template =
      input.shiftTemplateId != null
        ? {
            kind: "shift" as const,
            found: await this.shifts.find(workspaceId, input.shiftTemplateId),
          }
        : {
            kind: "rotation" as const,
            found: await this.rotations.find(
              workspaceId,
              input.rotationTemplateId ?? "",
            ),
          };
    if (!template.found?.isActive)
      throw new DomainError(
        "SHIFT_ASSIGNMENT_TEMPLATE_INACTIVE",
        template.found == null
          ? `That ${template.kind} was deleted. Choose another.`
          : `That ${template.kind} is inactive. Choose an active one.`,
        { details: { field: "template" } },
      );

    const found = await this.employees.find(workspaceId, memberIds);
    const missing = memberIds.filter((id) => !found.has(id));
    if (missing.length > 0)
      throw new DomainError(
        "SHIFT_ASSIGNMENT_MEMBER_NOT_FOUND",
        "A chosen Team Member was removed. Reload and choose again.",
        { details: { field: "memberIds", memberIds: missing } },
      );
    for (const memberId of memberIds)
      await this.monthLock.assertOpen(workspaceId, memberId, effectiveFrom);

    return this.store.assign({
      workspaceId,
      memberIds,
      template: { kind: template.kind, id: template.found.id },
      effectiveFrom,
      by: userId,
      now: this.clock(),
    });
  }
}
