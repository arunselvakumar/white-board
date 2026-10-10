import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";
import {
  RESOURCE_KINDS,
  type ResourceKind,
} from "@/src/composition/project-resources";

import { ConstructionProjectsProjectParamsModel } from "../../project-models";
import {
  ConstructionProjectsProjectResourceResponseModel,
  ConstructionProjectsProjectResourcesResponseModel,
  ConstructionProjectsProjectTeamMemberResourceResponseModel,
  ListConstructionProjectsResourceOptionsResponseModel,
  RESOURCE_SEGMENTS,
  SetConstructionProjectsProjectResourcesRequestModel,
} from "./resources-models";

const PROJECTS = ["Construction · Projects"];

const BASE = "/api/construction/projects/projects/{id}/resources";

const SESSION_ERRORS = [
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
] as const;

/** Project Resources' models (CM-406). */
export const projectResourcesOpenApiComponents: OpenApiComponents = {
  ConstructionProjectsProjectResourceResponseModel,
  ConstructionProjectsProjectTeamMemberResourceResponseModel,
  ConstructionProjectsProjectResourcesResponseModel,
  ListConstructionProjectsResourceOptionsResponseModel,
  SetConstructionProjectsProjectResourcesRequestModel,
};

const KIND_NOTES: Record<ResourceKind, { label: string; rules: string }> = {
  team_members: {
    label: "Team Members",
    rules:
      "Written by the organization context: the Owner is on every Project (their id is ignored); 400 HRMS_MEMBER_HAS_NO_PROJECTS, TEAM_MEMBER_NOT_FOUND, TEAM_MEMBER_DECLINED",
  },
  contractors: {
    label: "Contractors",
    rules:
      "Written by the masters context: 400 CONTRACTOR_NOT_FOUND, CONTRACTOR_INACTIVE (an inactive one may stay, not be added)",
  },
  suppliers: {
    label: "Suppliers",
    rules:
      "Written by the masters context: 400 SUPPLIER_NOT_FOUND, SUPPLIER_INACTIVE (an inactive one may stay, not be added)",
  },
  vendors: {
    label: "Vendors",
    rules:
      "Written by the labour context: 400 VENDOR_NOT_FOUND, VENDOR_INACTIVE (an inactive one may stay, not be added)",
  },
};

function kindOperations(kind: ResourceKind): OpenApiOperation[] {
  const { label, rules } = KIND_NOTES[kind];
  const path = `${BASE}/${RESOURCE_SEGMENTS[kind]}`;
  return [
    {
      method: "get",
      path: `${path}/options`,
      summary: `The Company's active ${label} the Edit dialog offers (Project menu Update; 404 for a Project you are not on)`,
      tags: PROJECTS,
      params: ConstructionProjectsProjectParamsModel,
      successStatus: StatusCodes.OK,
      successDescription: `${label} that can be added`,
      successSchema: ListConstructionProjectsResourceOptionsResponseModel,
      errors: [
        StatusCodes.BAD_REQUEST,
        ...SESSION_ERRORS,
        StatusCodes.NOT_FOUND,
      ],
    },
    {
      method: "post",
      path,
      summary: `Replace the ${label} on the Project with \`ids\`, sending the \`expectedIds\` you loaded (409 PROJECT_RESOURCES_CHANGED when they moved). ${rules}`,
      tags: PROJECTS,
      params: ConstructionProjectsProjectParamsModel,
      body: SetConstructionProjectsProjectResourcesRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "The Project's Resources after the change",
      successSchema: ConstructionProjectsProjectResourcesResponseModel,
      errors: [
        StatusCodes.BAD_REQUEST,
        ...SESSION_ERRORS,
        StatusCodes.PAYMENT_REQUIRED,
        StatusCodes.NOT_FOUND,
        StatusCodes.CONFLICT,
      ],
    },
  ];
}

/** Project Resources' routes (CM-406). */
export const projectResourcesOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: BASE,
    summary:
      "A Project's Team Members (the Owner first), Contractors, Suppliers and Vendors (Project menu Read; 404 for a Project you are not on)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Project's Resources",
    successSchema: ConstructionProjectsProjectResourcesResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  ...RESOURCE_KINDS.flatMap(kindOperations),
];
