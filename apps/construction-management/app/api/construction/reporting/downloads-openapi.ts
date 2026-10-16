import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ConstructionReportingCatalogueEntryResponseModel,
  ListConstructionReportingCatalogueRequestModel,
  ListConstructionReportingCatalogueResponseModel,
  REPORT_CATALOGUE_PATH,
} from "./catalogue/catalogue-models";
import {
  ConstructionReportingDownloadItemModel,
  DOWNLOADS_PATH,
  ListConstructionReportingDownloadsRequestModel,
  ListConstructionReportingDownloadsResponseModel,
} from "./downloads/download-models";

const REPORTING = ["Construction · Reporting"];

/** The report catalogue and Downloads (CM-901, ADR CM-0021 §2). */
export const reportingDownloadsOpenApiComponents: OpenApiComponents = {
  ConstructionReportingCatalogueEntryResponseModel,
  ListConstructionReportingCatalogueResponseModel,
  ConstructionReportingDownloadItemModel,
  ListConstructionReportingDownloadsResponseModel,
};

export const reportingDownloadsOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: REPORT_CATALOGUE_PATH,
    summary:
      "The reports you may request on a Project (scope=project&projectId=) or centrally (scope=central): title, wording, period, filters, files and whether your files would carry amounts. Reports about money are left out without the money right; reports not built yet are left out",
    tags: REPORTING,
    query: ListConstructionReportingCatalogueRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Catalogue entries in display order",
    successSchema: ListConstructionReportingCatalogueResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.NOT_FOUND,
    ],
  },
  {
    method: "get",
    path: DOWNLOADS_PATH,
    summary:
      "Your own reports (and later backups and data exports) across every Project and central, newest first, with status, download links, Retry and Delete where allowed. Rows carry a `source`",
    tags: REPORTING,
    query: ListConstructionReportingDownloadsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of rows and the next page's cursor",
    successSchema: ListConstructionReportingDownloadsResponseModel,
    errors: [StatusCodes.BAD_REQUEST, StatusCodes.UNAUTHORIZED],
  },
];
