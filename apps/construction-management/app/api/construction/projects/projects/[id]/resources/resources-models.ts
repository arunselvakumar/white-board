import { z } from "zod";

import type {
  ProjectResource,
  ProjectResources,
  ResourceKind,
} from "@/src/composition/project-resources";

/** The path segment of each party kind under `…/resources/`. */
export const RESOURCE_SEGMENTS: Record<ResourceKind, string> = {
  team_members: "team-members",
  contractors: "contractors",
  suppliers: "suppliers",
  vendors: "vendors",
};

const resourceFields = {
  id: z.uuid(),
  name: z.string(),
  detail: z
    .string()
    .nullable()
    .describe(
      "A second line: Designation (Team Members), Departments (Contractors), contact person (Suppliers) or mobile.",
    ),
  isActive: z
    .boolean()
    .describe(
      "False for an inactive Contractor, Supplier or Vendor, or a declined Team Member: they stay on the Project but cannot be added again.",
    ),
};

export const ConstructionProjectsProjectResourceResponseModel =
  z.object(resourceFields);
export type ConstructionProjectsProjectResourceResponseModel = z.infer<
  typeof ConstructionProjectsProjectResourceResponseModel
>;

export const ConstructionProjectsProjectTeamMemberResourceResponseModel =
  z.object({
    ...resourceFields,
    isOwner: z
      .boolean()
      .describe("The Owner is on every Project and cannot be taken off."),
  });

/** A Project's Resources, each kind by name (the Owner first). */
export const ConstructionProjectsProjectResourcesResponseModel = z.object({
  teamMembers: z.array(
    ConstructionProjectsProjectTeamMemberResourceResponseModel,
  ),
  contractors: z.array(ConstructionProjectsProjectResourceResponseModel),
  suppliers: z.array(ConstructionProjectsProjectResourceResponseModel),
  vendors: z.array(ConstructionProjectsProjectResourceResponseModel),
});
export type ConstructionProjectsProjectResourcesResponseModel = z.infer<
  typeof ConstructionProjectsProjectResourcesResponseModel
>;

/** The Company's active parties of one kind, for the Edit dialog. */
export const ListConstructionProjectsResourceOptionsResponseModel = z.object({
  items: z.array(ConstructionProjectsProjectResourceResponseModel),
});
export type ListConstructionProjectsResourceOptionsResponseModel = z.infer<
  typeof ListConstructionProjectsResourceOptionsResponseModel
>;

/** Replaces the parties of one kind on the Project. */
export const SetConstructionProjectsProjectResourcesRequestModel = z.object({
  ids: z
    .array(z.uuid())
    .max(500)
    .describe("Every party of this kind that should be on the Project."),
  expectedIds: z
    .array(z.uuid())
    .max(500)
    .describe(
      "The ones the screen loaded (the Owner left out). A mismatch is 409 PROJECT_RESOURCES_CHANGED.",
    ),
});
export type SetConstructionProjectsProjectResourcesRequestModel = z.infer<
  typeof SetConstructionProjectsProjectResourcesRequestModel
>;

function toResource(
  item: ProjectResource,
): ConstructionProjectsProjectResourceResponseModel {
  return {
    id: item.id,
    name: item.name,
    detail: item.detail,
    isActive: item.isActive,
  };
}

export function toResourcesResponse(
  resources: ProjectResources,
): ConstructionProjectsProjectResourcesResponseModel {
  return {
    teamMembers: resources.teamMembers.map((item) => ({
      ...toResource(item),
      isOwner: item.isOwner,
    })),
    contractors: resources.contractors.map(toResource),
    suppliers: resources.suppliers.map(toResource),
    vendors: resources.vendors.map(toResource),
  };
}

export function toResourceOptionsResponse(
  items: readonly ProjectResource[],
): ListConstructionProjectsResourceOptionsResponseModel {
  return { items: items.map(toResource) };
}
