import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ConstructionSiteWorkSiteDiaryActionsResponseModel,
  ConstructionSiteWorkSiteDiaryParamsModel,
  ConstructionSiteWorkSiteDiaryResponseModel,
  CreateConstructionSiteWorkSiteDiaryRequestModel,
  DeleteConstructionSiteWorkSiteDiaryRequestModel,
  GetConstructionSiteWorkSiteDiaryByDateRequestModel,
  GetConstructionSiteWorkSiteDiaryByDateResponseModel,
  ListConstructionSiteWorkSiteDiariesRequestModel,
  ListConstructionSiteWorkSiteDiariesResponseModel,
  SITE_DIARY_PATH,
  UpdateConstructionSiteWorkSiteDiaryRequestModel,
} from "./site-diary-models";

const TAGS = ["Construction · Site work"];

const READ_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
];

const WRITE_ERRORS = [
  ...READ_ERRORS,
  StatusCodes.CONFLICT,
  StatusCodes.PAYMENT_REQUIRED,
];

const ITEM = `${SITE_DIARY_PATH}/{id}`;

/** Request and Response models of `/api/construction/site-work/site-diary` (CM-607). */
export const siteDiaryOpenApiComponents: OpenApiComponents = {
  CreateConstructionSiteWorkSiteDiaryRequestModel,
  UpdateConstructionSiteWorkSiteDiaryRequestModel,
  DeleteConstructionSiteWorkSiteDiaryRequestModel,
  ConstructionSiteWorkSiteDiaryActionsResponseModel,
  ConstructionSiteWorkSiteDiaryResponseModel,
  GetConstructionSiteWorkSiteDiaryByDateResponseModel,
  ListConstructionSiteWorkSiteDiariesResponseModel,
};

/**
 * Site Diary routes (CM-607), menu `site_work.site_diary` on the diary's
 * Project: read, create, update, delete. One diary per Project per date.
 */
export const siteDiaryOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: SITE_DIARY_PATH,
    summary: "The dates in a range that have a Site Diary on a Project",
    tags: TAGS,
    query: ListConstructionSiteWorkSiteDiariesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Diary dates, newest first",
    successSchema: ListConstructionSiteWorkSiteDiariesResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: SITE_DIARY_PATH,
    summary: "Write the Site Diary for a date (one per Project per date)",
    tags: TAGS,
    body: CreateConstructionSiteWorkSiteDiaryRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new Site Diary",
    successSchema: ConstructionSiteWorkSiteDiaryResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${SITE_DIARY_PATH}/by-date`,
    summary: "A Project's Site Diary for a date, or none",
    tags: TAGS,
    query: GetConstructionSiteWorkSiteDiaryByDateRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The diary for the date, or null",
    successSchema: GetConstructionSiteWorkSiteDiaryByDateResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: ITEM,
    summary: "One Site Diary with its visitors and instructions",
    tags: TAGS,
    params: ConstructionSiteWorkSiteDiaryParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Site Diary",
    successSchema: ConstructionSiteWorkSiteDiaryResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary: "Edit a Site Diary; visitors and instructions are replaced",
    tags: TAGS,
    params: ConstructionSiteWorkSiteDiaryParamsModel,
    body: UpdateConstructionSiteWorkSiteDiaryRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The saved Site Diary",
    successSchema: ConstructionSiteWorkSiteDiaryResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary: "Delete a Site Diary",
    tags: TAGS,
    params: ConstructionSiteWorkSiteDiaryParamsModel,
    body: DeleteConstructionSiteWorkSiteDiaryRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
];
