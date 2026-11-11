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
  AddConstructionProjectsProjectLaboursRequestModel,
  ConstructionProjectsProjectLabourOptionResponseModel,
  ConstructionProjectsProjectLabourParamsModel,
  ConstructionProjectsProjectLabourResponseModel,
  ListConstructionProjectsProjectLabourOptionsRequestModel,
  ListConstructionProjectsProjectLabourOptionsResponseModel,
  ListConstructionProjectsProjectLaboursRequestModel,
  ListConstructionProjectsProjectLaboursResponseModel,
  RemoveConstructionProjectsProjectLabourRequestModel,
} from "./labours/project-labours-models";
import {
  ConstructionProjectsProjectResourceResponseModel,
  ConstructionProjectsProjectResourcesResponseModel,
  ConstructionProjectsProjectSiteEngineerOptionResponseModel,
  ConstructionProjectsProjectSiteEngineerResponseModel,
  ConstructionProjectsProjectTeamMemberResourceResponseModel,
  ListConstructionProjectsResourceOptionsResponseModel,
  ListConstructionProjectsSiteEngineerOptionsResponseModel,
  RESOURCE_SEGMENTS,
  SetConstructionProjectsProjectResourcesRequestModel,
} from "./resources-models";

const PROJECTS = ["Construction · Projects"];

const BASE = "/api/construction/projects/projects/{id}/resources";

const SESSION_ERRORS = [
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
] as const;

/** Project Resources' models. */
export const projectResourcesOpenApiComponents: OpenApiComponents = {
  ConstructionProjectsProjectResourceResponseModel,
  ConstructionProjectsProjectTeamMemberResourceResponseModel,
  ConstructionProjectsProjectResourcesResponseModel,
  ListConstructionProjectsResourceOptionsResponseModel,
  SetConstructionProjectsProjectResourcesRequestModel,
  ConstructionProjectsProjectSiteEngineerResponseModel,
  ConstructionProjectsProjectSiteEngineerOptionResponseModel,
  ListConstructionProjectsSiteEngineerOptionsResponseModel,
  ConstructionProjectsProjectLabourResponseModel,
  ListConstructionProjectsProjectLaboursRequestModel,
  ListConstructionProjectsProjectLaboursResponseModel,
  ConstructionProjectsProjectLabourOptionResponseModel,
  ListConstructionProjectsProjectLabourOptionsRequestModel,
  ListConstructionProjectsProjectLabourOptionsResponseModel,
  AddConstructionProjectsProjectLaboursRequestModel,
  RemoveConstructionProjectsProjectLabourRequestModel,
};

const KIND_NOTES: Record<ResourceKind, { label: string; rules: string }> = {
  team_members: {
    label: "Team Members",
    rules:
      "Written by the organization context: the Owner is on every Project (their id is ignored), and a Site Engineer's sign-in is ignored in ids and expectedIds (change it under Site Engineers); 400 HRMS_MEMBER_HAS_NO_PROJECTS, TEAM_MEMBER_NOT_FOUND, TEAM_MEMBER_DECLINED",
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

const WRITE_ERRORS = [
  StatusCodes.BAD_REQUEST,
  ...SESSION_ERRORS,
  StatusCodes.PAYMENT_REQUIRED,
  StatusCodes.NOT_FOUND,
  StatusCodes.CONFLICT,
];

const staffingOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: `${BASE}/site-engineers/options`,
    summary:
      "Enabled Site Engineers not on the Project; those without a sign-in come with hasSignIn false and cannot be added (Project menu Update; 404 for a Project you are not on)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Site Engineers that can be added",
    successSchema: ListConstructionProjectsSiteEngineerOptionsResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${BASE}/site-engineers`,
    summary:
      "Replace the Site Engineers on the Project with `ids` (Site Engineer ids), sending the `expectedIds` you loaded (409 PROJECT_RESOURCES_CHANGED when they moved). Their sign-ins are assigned by the organization context and audited team_member.projects_changed; no other sign-in changes. 400 SUPERVISOR_NOT_FOUND, SUPERVISOR_DISABLED (a disabled one may stay, not be added), 409 SITE_ENGINEER_NO_SIGN_IN",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    body: SetConstructionProjectsProjectResourcesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Project's Resources after the change",
    successSchema: ConstructionProjectsProjectResourcesResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${BASE}/labours`,
    summary:
      "The Labours on a Project by name, searchable, with cursors both ways and the total (Project menu Read; 404 for a Project you are not on)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    query: ListConstructionProjectsProjectLaboursRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of the Project's Labours",
    successSchema: ListConstructionProjectsProjectLaboursResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "get",
    path: `${BASE}/labours/options`,
    summary:
      "Active Labours not on the Project, by name, for Add Labours (Project menu Update and Labours Read; 404 for a Project you are not on)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    query: ListConstructionProjectsProjectLabourOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Labours that can be added",
    successSchema: ListConstructionProjectsProjectLabourOptionsResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${BASE}/labours`,
    summary:
      "Add Labours to the Project from a date, written by the labour context as Edit Labour writes them; all or none, the error naming the Labour (details.labourId) and the field. 400 LABOURS_REQUIRED, TOO_MANY_LABOURS, FROM_DATE_INVALID, FROM_BEFORE_JOINING_DATE, LABOUR_INACTIVE, REMARK_TOO_LONG; 404 LABOUR_NOT_FOUND, PROJECT_NOT_FOUND; 409 LABOUR_ALREADY_ON_PROJECT, TRANSFER_BEFORE_LAST_TRANSFER, LABOUR_CHANGED (Project menu Update)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    body: AddConstructionProjectsProjectLaboursRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Added",
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${BASE}/labours/{labourId}/remove`,
    summary:
      "Take a Labour off the Project after their Last day; the history row is dated the day after. Attendance, wages and payments stay. 400 LAST_DAY_INVALID, REMARK_TOO_LONG; 404 LABOUR_NOT_FOUND; 409 LABOUR_NOT_ON_PROJECT, TRANSFER_BEFORE_ATTENDANCE (attendance after the Last day), TRANSFER_BEFORE_LAST_TRANSFER, LABOUR_CHANGED (Project menu Update)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectLabourParamsModel,
    body: RemoveConstructionProjectsProjectLabourRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Removed",
    errors: WRITE_ERRORS,
  },
];

/** Project Resources' routes. */
export const projectResourcesOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: BASE,
    summary:
      "A Project's Site Engineers, the number of Labours, Team Members (the Owner first, Site Engineers' sign-ins left out), Contractors, Suppliers and Vendors (Project menu Read; 404 for a Project you are not on)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Project's Resources",
    successSchema: ConstructionProjectsProjectResourcesResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  ...staffingOperations,
  ...RESOURCE_KINDS.flatMap(kindOperations),
];
