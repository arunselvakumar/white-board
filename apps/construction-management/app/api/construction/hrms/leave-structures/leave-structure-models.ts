import { z } from "zod";

import type {
  LeaveAssignmentReadModel,
  LeaveStructureReadModel,
} from "@/src/hrms/application/leave-configuration-handlers";

export const LEAVE_STRUCTURES_PATH = "/api/construction/hrms/leave-structures";

const structureFields = {
  name: z.string().max(200),
  description: z.string().max(2000).nullable().optional(),
  lines: z
    .array(
      z.object({
        leaveTypeId: z.uuid(),
        entitlementDays: z
          .number()
          .nullable()
          .optional()
          .describe(
            "Days a year for this structure; null uses the type's yearly limit.",
          ),
      }),
    )
    .max(100)
    .describe("Each leave type once; at least one."),
};

export const CreateConstructionHrmsLeaveStructureRequestModel =
  z.object(structureFields);

export type CreateConstructionHrmsLeaveStructureRequestModel = z.input<
  typeof CreateConstructionHrmsLeaveStructureRequestModel
>;

export const UpdateConstructionHrmsLeaveStructureRequestModel = z.object({
  ...structureFields,
  expectedUpdatedAt: z.iso
    .datetime()
    .describe(
      "The `updatedAt` you loaded; a mismatch is 409 LEAVE_STRUCTURE_CHANGED.",
    ),
});

export type UpdateConstructionHrmsLeaveStructureRequestModel = z.input<
  typeof UpdateConstructionHrmsLeaveStructureRequestModel
>;

export const ConstructionHrmsLeaveStructureResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  lines: z.array(
    z.object({
      leaveTypeId: z.uuid(),
      leaveTypeName: z.string(),
      entitlementDays: z.number().nullable(),
      effectiveDays: z
        .number()
        .describe("The line's days, else the type's yearly limit."),
    }),
  ),
  assignmentCount: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ConstructionHrmsLeaveStructureResponseModel = z.infer<
  typeof ConstructionHrmsLeaveStructureResponseModel
>;

export const ListConstructionHrmsLeaveStructuresResponseModel = z.object({
  items: z.array(ConstructionHrmsLeaveStructureResponseModel),
});

export type ListConstructionHrmsLeaveStructuresResponseModel = z.infer<
  typeof ListConstructionHrmsLeaveStructuresResponseModel
>;

export const ListConstructionHrmsLeaveAssignmentsRequestModel = z.object({
  memberId: z.uuid().optional(),
  structureId: z.uuid().optional(),
});

export const CreateConstructionHrmsLeaveAssignmentsRequestModel = z.object({
  structureId: z.uuid(),
  memberIds: z.array(z.uuid()).max(500),
  effectiveFrom: z.iso
    .date()
    .describe("The structure applies from this date until a later assignment."),
});

export type CreateConstructionHrmsLeaveAssignmentsRequestModel = z.infer<
  typeof CreateConstructionHrmsLeaveAssignmentsRequestModel
>;

export const ConstructionHrmsLeaveAssignmentResponseModel = z.object({
  id: z.uuid(),
  memberId: z.uuid(),
  memberName: z.string(),
  structureId: z.uuid(),
  structureName: z.string(),
  effectiveFrom: z.iso.date(),
  createdAt: z.iso.datetime(),
});

export type ConstructionHrmsLeaveAssignmentResponseModel = z.infer<
  typeof ConstructionHrmsLeaveAssignmentResponseModel
>;

export const ListConstructionHrmsLeaveAssignmentsResponseModel = z.object({
  items: z.array(ConstructionHrmsLeaveAssignmentResponseModel),
});

export type ListConstructionHrmsLeaveAssignmentsResponseModel = z.infer<
  typeof ListConstructionHrmsLeaveAssignmentsResponseModel
>;

export function toLeaveStructureResponse(
  structure: LeaveStructureReadModel,
): ConstructionHrmsLeaveStructureResponseModel {
  return {
    id: structure.id,
    name: structure.name,
    description: structure.description,
    isActive: structure.isActive,
    lines: structure.lines.map((line) => ({ ...line })),
    assignmentCount: structure.assignmentCount,
    createdAt: structure.createdAt.toISOString(),
    updatedAt: structure.updatedAt.toISOString(),
  };
}

export function toLeaveAssignmentResponse(
  assignment: LeaveAssignmentReadModel,
): ConstructionHrmsLeaveAssignmentResponseModel {
  return {
    id: assignment.id,
    memberId: assignment.memberId,
    memberName: assignment.memberName,
    structureId: assignment.structureId,
    structureName: assignment.structureName,
    effectiveFrom: assignment.effectiveFrom,
    createdAt: assignment.createdAt.toISOString(),
  };
}
