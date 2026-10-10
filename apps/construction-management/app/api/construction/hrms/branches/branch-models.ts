import { z } from "zod";

import type {
  BranchView,
  ProjectSite,
} from "@/src/hrms/application/branch-handlers";
import type { HrmsEmployee } from "@/src/hrms/application/ports";
import {
  BRANCH_KINDS,
  BRANCH_LIMITS,
  type Fence,
} from "@/src/hrms/domain/branch";

export const BRANCHES_PATH = "/api/construction/hrms/branches";

export const HrmsBranchIdParamsModel = z.object({ id: z.uuid() });

const point = {
  latitude: z.number().describe("Degrees, −90 to 90; kept to 6 decimals."),
  longitude: z.number().describe("Degrees, −180 to 180; kept to 6 decimals."),
  radiusMetres: z
    .number()
    .describe(
      `Fence radius, whole metres, ${String(BRANCH_LIMITS.minRadiusMetres)}–${String(BRANCH_LIMITS.maxRadiusMetres)}.`,
    ),
};

const details = {
  name: z
    .string()
    .describe(
      "Branch name, or the site label of a project site; ≤ 80 characters.",
    ),
  address: z.string().nullable().optional(),
  projectId: z
    .uuid()
    .nullable()
    .optional()
    .describe("Required for a project site; ignored for an office branch."),
  ...point,
};

export const CreateConstructionHrmsBranchRequestModel = z.object({
  kind: z
    .enum(BRANCH_KINDS)
    .describe("`office_branch` or `project_site` (one per Project)."),
  ...details,
});

export type CreateConstructionHrmsBranchRequestModel = z.input<
  typeof CreateConstructionHrmsBranchRequestModel
>;

export const UpdateConstructionHrmsBranchRequestModel = z.object({
  ...details,
  expectedUpdatedAt: z.iso
    .datetime()
    .describe("The `updatedAt` you loaded; a mismatch is 409 BRANCH_CHANGED."),
});

export type UpdateConstructionHrmsBranchRequestModel = z.input<
  typeof UpdateConstructionHrmsBranchRequestModel
>;

export const SetConstructionHrmsBranchMembersRequestModel = z.object({
  memberIds: z
    .array(z.uuid())
    .max(1000)
    .describe(
      "Team Members who check in here (replaces the list). Empty: nobody is linked.",
    ),
  expectedUpdatedAt: z.iso.datetime(),
});

export type SetConstructionHrmsBranchMembersRequestModel = z.input<
  typeof SetConstructionHrmsBranchMembersRequestModel
>;

export const ConstructionHrmsBranchResponseModel = z.object({
  id: z.uuid(),
  kind: z.enum(BRANCH_KINDS),
  name: z.string(),
  address: z.string().nullable(),
  projectId: z.uuid().nullable(),
  projectName: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  radiusMetres: z.int(),
  /** Linked Team Members (office branches only). */
  memberIds: z.array(z.uuid()),
  createdAt: z.iso.datetime(),
  /** Send back as `expectedUpdatedAt`. */
  updatedAt: z.iso.datetime(),
});

export type ConstructionHrmsBranchResponseModel = z.infer<
  typeof ConstructionHrmsBranchResponseModel
>;

const employee = z.object({
  memberId: z.uuid(),
  name: z.string(),
  memberType: z.enum(["normal", "hrms"]),
  designationName: z.string().nullable(),
  /** False while Joining Pending. */
  active: z.boolean(),
});

export const ListConstructionHrmsBranchesResponseModel = z.object({
  /** Office branches first, then site fences, each by name. */
  items: z.array(ConstructionHrmsBranchResponseModel),
  /** Team Members that can be linked to an office branch. */
  employees: z.array(employee),
});

export type ListConstructionHrmsBranchesResponseModel = z.infer<
  typeof ListConstructionHrmsBranchesResponseModel
>;

export const ListConstructionHrmsProjectSitesResponseModel = z.object({
  items: z.array(
    z.object({
      project: z.object({ id: z.uuid(), name: z.string() }),
      fence: ConstructionHrmsBranchResponseModel.nullable(),
    }),
  ),
});

export type ListConstructionHrmsProjectSitesResponseModel = z.infer<
  typeof ListConstructionHrmsProjectSitesResponseModel
>;

export const ConstructionHrmsFenceResponseModel = z.object({
  id: z.uuid(),
  kind: z.enum(BRANCH_KINDS),
  name: z.string(),
  projectId: z.uuid().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  radiusMetres: z.int(),
});

export const ListConstructionHrmsMyFencesResponseModel = z.object({
  memberId: z.uuid(),
  /** Empty: "Office location is not configured" when GPS is required. */
  items: z.array(ConstructionHrmsFenceResponseModel),
});

export type ListConstructionHrmsMyFencesResponseModel = z.infer<
  typeof ListConstructionHrmsMyFencesResponseModel
>;

export function toBranchResponse(
  branch: BranchView,
): ConstructionHrmsBranchResponseModel {
  return {
    id: branch.id,
    kind: branch.kind,
    name: branch.name,
    address: branch.address,
    projectId: branch.projectId,
    projectName: branch.projectName,
    latitude: branch.latitude,
    longitude: branch.longitude,
    radiusMetres: branch.radiusMetres,
    memberIds: [...branch.memberIds],
    createdAt: branch.createdAt.toISOString(),
    updatedAt: branch.updatedAt.toISOString(),
  };
}

export function toEmployeeOption(item: HrmsEmployee) {
  return {
    memberId: item.memberId,
    name: item.name,
    memberType: item.memberType,
    designationName: item.designationName,
    active: item.active,
  };
}

export function toProjectSiteResponse(site: ProjectSite) {
  return {
    project: { id: site.project.id, name: site.project.name },
    fence: site.fence == null ? null : toBranchResponse(site.fence),
  };
}

export function toFenceResponse(fence: Fence) {
  return {
    id: fence.id,
    kind: fence.kind,
    name: fence.name,
    projectId: fence.projectId,
    latitude: fence.latitude,
    longitude: fence.longitude,
    radiusMetres: fence.radiusMetres,
  };
}
