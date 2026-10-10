import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  BRANCHES_PATH,
  ConstructionHrmsBranchResponseModel,
  ConstructionHrmsFenceResponseModel,
  CreateConstructionHrmsBranchRequestModel,
  HrmsBranchIdParamsModel,
  ListConstructionHrmsBranchesResponseModel,
  ListConstructionHrmsMyFencesResponseModel,
  ListConstructionHrmsProjectSitesResponseModel,
  SetConstructionHrmsBranchMembersRequestModel,
  UpdateConstructionHrmsBranchRequestModel,
} from "./branch-models";

const HRMS = ["Construction · HRMS"];
const SESSION = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN] as const;
const WRITE = [
  StatusCodes.BAD_REQUEST,
  ...SESSION,
  StatusCodes.NOT_FOUND,
  StatusCodes.CONFLICT,
  StatusCodes.PAYMENT_REQUIRED,
] as const;
const ITEM = `${BRANCHES_PATH}/{id}`;

/** Branches & Sites models (CM-304). */
export const branchOpenApiComponents: OpenApiComponents = {
  ConstructionHrmsBranchResponseModel,
  ListConstructionHrmsBranchesResponseModel,
  CreateConstructionHrmsBranchRequestModel,
  UpdateConstructionHrmsBranchRequestModel,
  SetConstructionHrmsBranchMembersRequestModel,
  ListConstructionHrmsProjectSitesResponseModel,
  ConstructionHrmsFenceResponseModel,
  ListConstructionHrmsMyFencesResponseModel,
};

/** Branches & Sites routes (CM-304). */
export const branchOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: BRANCHES_PATH,
    summary:
      "Office branches and Project site fences, with linkable Team Members (menu `hrms.settings`, read)",
    tags: HRMS,
    successStatus: StatusCodes.OK,
    successDescription: "Every fence of the Company",
    successSchema: ListConstructionHrmsBranchesResponseModel,
    errors: [...SESSION],
  },
  {
    method: "post",
    path: BRANCHES_PATH,
    summary:
      "Add an office branch or a Project's site fence: point and radius 25–5,000 m (menu `hrms.settings`, create)",
    tags: HRMS,
    body: CreateConstructionHrmsBranchRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The fence",
    successSchema: ConstructionHrmsBranchResponseModel,
    errors: [...WRITE],
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary: "Edit a branch or site fence (menu `hrms.settings`, update)",
    tags: HRMS,
    params: HrmsBranchIdParamsModel,
    body: UpdateConstructionHrmsBranchRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The fence",
    successSchema: ConstructionHrmsBranchResponseModel,
    errors: [...WRITE],
  },
  {
    method: "post",
    path: `${ITEM}/remove`,
    summary:
      "Remove a fence; its member links go with it (menu `hrms.settings`, delete)",
    tags: HRMS,
    params: HrmsBranchIdParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Removed",
    errors: [...WRITE],
  },
  {
    method: "post",
    path: `${ITEM}/members`,
    summary:
      "Replace the Team Members who check in at an office branch (menu `hrms.settings`, update)",
    tags: HRMS,
    params: HrmsBranchIdParamsModel,
    body: SetConstructionHrmsBranchMembersRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The branch with its members",
    successSchema: ConstructionHrmsBranchResponseModel,
    errors: [...WRITE],
  },
  {
    method: "get",
    path: `${BRANCHES_PATH}/project-sites`,
    summary:
      "Every Project with its site fence or null (menu `hrms.settings`, read)",
    tags: HRMS,
    successStatus: StatusCodes.OK,
    successDescription: "Projects by name",
    successSchema: ListConstructionHrmsProjectSitesResponseModel,
    errors: [...SESSION],
  },
  {
    method: "get",
    path: `${BRANCHES_PATH}/my-fences`,
    summary:
      "The fences the signed-in member checks in at: linked office branches (all when none) plus their Projects' sites (menu `hrms.attendance`, read)",
    tags: HRMS,
    successStatus: StatusCodes.OK,
    successDescription: "The member's fences",
    successSchema: ListConstructionHrmsMyFencesResponseModel,
    errors: [...SESSION, StatusCodes.NOT_FOUND],
  },
];
