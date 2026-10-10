import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ConstructionProjectsProjectDevelopmentsResponseModel,
  UpdateConstructionProjectsProjectDevelopmentsRequestModel,
} from "./projects/[id]/developments/developments-models";
import {
  ConstructionProjectsDashboardLayoutResponseModel,
  UpdateConstructionProjectsDashboardLayoutRequestModel,
} from "./dashboard-layout/dashboard-layout-models";
import { ConstructionProjectsProjectSummaryResponseModel } from "./projects/[id]/dashboard/dashboard-models";
import {
  ConstructionProjectsPinResponseModel,
  ConstructionProjectsProjectHomeResponseModel,
  UpdateConstructionProjectsHiddenModulesRequestModel,
} from "./projects/[id]/home/home-models";
import { ConstructionProjectsProjectListItemModel } from "./projects/list-projects-models";
import { ConstructionProjectsProjectParamsModel } from "./projects/project-models";
import {
  ConstructionProjectsTileOrderResponseModel,
  UpdateConstructionProjectsTileOrderRequestModel,
} from "./tile-order/tile-order-models";

const PROJECTS = ["Construction · Projects"];

const BASE = "/api/construction/projects/projects";

const SESSION_ERRORS = [
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
] as const;

/**
 * Models of a Project's Amenities and Common Developments (CM-404), its
 * home and preferences (CM-411) and its dashboard (CM-412).
 */
export const projectHomeOpenApiComponents: OpenApiComponents = {
  ConstructionProjectsProjectDevelopmentsResponseModel,
  UpdateConstructionProjectsProjectDevelopmentsRequestModel,
  ConstructionProjectsProjectListItemModel,
  ConstructionProjectsProjectHomeResponseModel,
  UpdateConstructionProjectsHiddenModulesRequestModel,
  ConstructionProjectsPinResponseModel,
  UpdateConstructionProjectsTileOrderRequestModel,
  ConstructionProjectsTileOrderResponseModel,
  ConstructionProjectsDashboardLayoutResponseModel,
  UpdateConstructionProjectsDashboardLayoutRequestModel,
  ConstructionProjectsProjectSummaryResponseModel,
};

/** Routes of CM-404 (Project side), CM-411 and CM-412. */
export const projectHomeOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: `${BASE}/{id}/developments`,
    summary:
      "A Project's Amenities and Common Developments, disabled ones included, and the Company's enabled ones to add (menu `projects.project`, read; 404 for a Project you are not on)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Assigned rows and choices per kind",
    successSchema: ConstructionProjectsProjectDevelopmentsResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${BASE}/{id}/developments/update`,
    summary:
      "Set a Project's Amenities and Common Developments: the full set per kind, a kind left out keeps its rows (menu `projects.project`, update; 400 AMENITY_NOT_FOUND, AMENITY_DISABLED and the Common Development equivalents)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    body: UpdateConstructionProjectsProjectDevelopmentsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Assigned rows and choices per kind",
    successSchema: ConstructionProjectsProjectDevelopmentsResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.PAYMENT_REQUIRED,
      StatusCodes.NOT_FOUND,
    ],
  },
  {
    method: "get",
    path: `${BASE}/{id}/home`,
    summary:
      "A Project's home: the modules you may read on it, in your tile order; Wings and Locations by the Project's structure or rows; hidden modules left out, or marked for the Project menu's Update flag (menu `projects.project`, read; 404 for a Project you are not on)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Modules, pin and whether you may hide modules",
    successSchema: ConstructionProjectsProjectHomeResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${BASE}/{id}/hidden-modules/update`,
    summary:
      "Hide / Show Modules: the full set hidden on this Project, for everyone on it (menu `projects.project`, update; 400 PROJECT_MODULE_UNKNOWN)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    body: UpdateConstructionProjectsHiddenModulesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Your home on the Project",
    successSchema: ConstructionProjectsProjectHomeResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.PAYMENT_REQUIRED,
      StatusCodes.NOT_FOUND,
    ],
  },
  {
    method: "post",
    path: `${BASE}/{id}/pin`,
    summary:
      "Pin a Project to the top of your Projects home; yours only (menu `projects.project`, read)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Pinned",
    successSchema: ConstructionProjectsPinResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${BASE}/{id}/unpin`,
    summary: "Unpin a Project (menu `projects.project`, read)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Unpinned",
    successSchema: ConstructionProjectsPinResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: "/api/construction/projects/tile-order/update",
    summary:
      "Save your tile order for every Project's home; an empty list resets (any Team Member; 400 PROJECT_MODULE_UNKNOWN)",
    tags: PROJECTS,
    body: UpdateConstructionProjectsTileOrderRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Your tile order",
    successSchema: ConstructionProjectsTileOrderResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS],
  },
  {
    method: "get",
    path: "/api/construction/projects/dashboard-layout",
    summary:
      "Your Project Dashboard layout: every section in your order with what shows (menu `reporting.project_dashboard`, read)",
    tags: PROJECTS,
    successStatus: StatusCodes.OK,
    successDescription: "Sections in order",
    successSchema: ConstructionProjectsDashboardLayoutResponseModel,
    errors: [...SESSION_ERRORS],
  },
  {
    method: "post",
    path: "/api/construction/projects/dashboard-layout/update",
    summary:
      "Manage Dashboard: save your sections' order and what shows, for every Project (menu `reporting.project_dashboard`, read; 400 DASHBOARD_SECTION_UNKNOWN, DASHBOARD_SECTION_DUPLICATE)",
    tags: PROJECTS,
    body: UpdateConstructionProjectsDashboardLayoutRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Sections in order",
    successSchema: ConstructionProjectsDashboardLayoutResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS],
  },
  {
    method: "get",
    path: `${BASE}/{id}/dashboard/summary`,
    summary:
      "The Project Dashboard's Project summary: dates, status, type, budget (Financial) and counts of Wings, Floors, Units, Locations, drawings, testing reports and documents (menu `reporting.project_dashboard`, read; 404 for a Project you are not on)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Project summary",
    successSchema: ConstructionProjectsProjectSummaryResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
];
