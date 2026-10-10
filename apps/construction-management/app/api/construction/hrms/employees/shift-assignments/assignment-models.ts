import { z } from "zod";

import type {
  MemberAssignments,
  StoredAssignment,
} from "@/src/hrms/application/shift-assignment-handlers";

export const SHIFT_ASSIGNMENTS_PATH =
  "/api/construction/hrms/employees/shift-assignments";

export const ListConstructionHrmsShiftAssignmentsRequestModel = z.object({
  memberId: z.uuid().optional().describe("Only this Team Member."),
});

export const AssignConstructionHrmsShiftRequestModel = z.object({
  memberIds: z
    .array(z.uuid())
    .min(1)
    .max(500)
    .describe("The Team Members to assign."),
  shiftTemplateId: z
    .uuid()
    .nullable()
    .optional()
    .describe("An active shift template; or give a rotation."),
  rotationTemplateId: z
    .uuid()
    .nullable()
    .optional()
    .describe("An active rotation template; or give a shift."),
  effectiveFrom: z.iso
    .date()
    .describe(
      "From this date until changed; the assignment in force closes the day before.",
    ),
});

export type AssignConstructionHrmsShiftRequestModel = z.input<
  typeof AssignConstructionHrmsShiftRequestModel
>;

export const ConstructionHrmsShiftAssignmentResponseModel = z.object({
  id: z.uuid(),
  memberId: z.uuid(),
  kind: z.enum(["shift", "rotation"]),
  templateId: z.uuid(),
  templateName: z.string(),
  effectiveFrom: z.iso.date(),
  /** Inclusive; null = until changed. */
  effectiveTo: z.iso.date().nullable(),
  createdAt: z.iso.datetime(),
});

export type ConstructionHrmsShiftAssignmentResponseModel = z.infer<
  typeof ConstructionHrmsShiftAssignmentResponseModel
>;

export const ListConstructionHrmsShiftAssignmentsResponseModel = z.object({
  /** Today in the Company's time zone: what `current` is measured against. */
  today: z.iso.date(),
  items: z.array(
    z.object({
      member: z.object({
        memberId: z.uuid(),
        name: z.string(),
        memberType: z.enum(["normal", "hrms"]),
        designationName: z.string().nullable(),
        /** False while Joining Pending. */
        active: z.boolean(),
      }),
      /** In force today; null means the HRMS Settings day applies. */
      current: ConstructionHrmsShiftAssignmentResponseModel.nullable(),
      /** Starting after today, if planned. */
      upcoming: ConstructionHrmsShiftAssignmentResponseModel.nullable(),
      /** Every assignment, newest start first. */
      history: z.array(ConstructionHrmsShiftAssignmentResponseModel),
    }),
  ),
});

export type ListConstructionHrmsShiftAssignmentsResponseModel = z.infer<
  typeof ListConstructionHrmsShiftAssignmentsResponseModel
>;

export const AssignConstructionHrmsShiftResponseModel = z.object({
  items: z.array(ConstructionHrmsShiftAssignmentResponseModel),
});

export type AssignConstructionHrmsShiftResponseModel = z.infer<
  typeof AssignConstructionHrmsShiftResponseModel
>;

export function toAssignmentResponse(
  assignment: StoredAssignment,
): ConstructionHrmsShiftAssignmentResponseModel {
  return {
    id: assignment.id,
    memberId: assignment.memberId,
    kind: assignment.shiftTemplateId != null ? "shift" : "rotation",
    templateId:
      assignment.shiftTemplateId ?? assignment.rotationTemplateId ?? "",
    templateName: assignment.templateName,
    effectiveFrom: assignment.effectiveFrom,
    effectiveTo: assignment.effectiveTo,
    createdAt: assignment.createdAt.toISOString(),
  };
}

export function toMemberAssignmentsResponse(item: MemberAssignments) {
  return {
    member: {
      memberId: item.employee.memberId,
      name: item.employee.name,
      memberType: item.employee.memberType,
      designationName: item.employee.designationName,
      active: item.employee.active,
    },
    current: item.current == null ? null : toAssignmentResponse(item.current),
    upcoming:
      item.upcoming == null ? null : toAssignmentResponse(item.upcoming),
    history: item.history.map(toAssignmentResponse),
  };
}
