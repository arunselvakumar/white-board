import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import { ConstructionProjectsProjectParamsModel } from "../../project-models";
import {
  ConstructionProjectsGalleryItemResponseModel,
  ListConstructionProjectsGalleryQueryModel,
  ListConstructionProjectsGalleryResponseModel,
  ListConstructionProjectsGalleryUploadersResponseModel,
} from "./gallery-models";

const PROJECTS = ["Construction · Projects"];

const BASE = "/api/construction/projects/projects/{id}/gallery";

const ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
] as const;

/** The Gallery's models (CM-410). */
export const galleryOpenApiComponents: OpenApiComponents = {
  ConstructionProjectsGalleryItemResponseModel,
  ListConstructionProjectsGalleryResponseModel,
  ListConstructionProjectsGalleryUploadersResponseModel,
};

/** The Gallery's routes (CM-410), under `projects.gallery` read. */
export const galleryOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: BASE,
    summary:
      "The Project's images and PDFs, newest first (projects.gallery read). Only sources whose menu the member may read are listed (documents: projects.project, drawings: projects.drawings, testing reports: projects.testing_reports); `fileUrl` and `thumbUrl` are the source's own routes, which check that flag again",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    query: ListConstructionProjectsGalleryQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of files",
    successSchema: ListConstructionProjectsGalleryResponseModel,
    errors: [...ERRORS],
  },
  {
    method: "get",
    path: `${BASE}/uploaders`,
    summary:
      "Everyone who uploaded a file the member can see, for the Uploaded by filter (projects.gallery read)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Uploaders",
    successSchema: ListConstructionProjectsGalleryUploadersResponseModel,
    errors: [...ERRORS],
  },
];
