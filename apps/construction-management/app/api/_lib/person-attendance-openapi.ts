import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import type { OpenApiComponents, OpenApiOperation } from "./openapi";
import {
  ConstructionPersonAttendanceRequestModel,
  ConstructionPersonAttendanceResponseModel,
} from "./person-attendance-models";

/** The one model every person's Attendance route answers with (ADR CM-0051 §6). */
export const personAttendanceOpenApiComponents: OpenApiComponents = {
  ConstructionPersonAttendanceResponseModel,
};

const params = z.object({ id: z.uuid() });

const ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
];

function operation(
  path: string,
  who: string,
  tag: string,
  needs: string,
): OpenApiOperation {
  return {
    method: "get",
    path,
    summary: `${who}'s Attendance tab: months of days with the Projects worked at and the hours there, and all-time figures on the first page (ADR CM-0051). ${needs}`,
    tags: [tag],
    params,
    query: ConstructionPersonAttendanceRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of months, oldest first",
    successSchema: ConstructionPersonAttendanceResponseModel,
    errors: ERRORS,
  };
}

/** All four routes, listed here so they share one place in the document. */
export const personAttendanceOpenApiOperations: OpenApiOperation[] = [
  operation(
    "/api/construction/labour/labours/{id}/attendance",
    "A Labour",
    "Construction · Labour",
    "Labours Read; days at Projects the viewer may not open are left out.",
  ),
  operation(
    "/api/construction/masters/site-engineers/{id}/attendance",
    "A Site Engineer",
    "Construction · Masters",
    "Labours Read; from the Check-In log, on Projects with Attendance Read.",
  ),
  operation(
    "/api/construction/labour/vendors/{id}/attendance",
    "A Vendor",
    "Construction · Labour",
    "Vendors Read; headcount and head-days, at Projects the viewer may open.",
  ),
  operation(
    "/api/construction/organization/team-members/{id}/attendance",
    "An Office Staff member",
    "Construction · Organization",
    "Office Staff Read and HRMS Attendance Read; the HRMS day status and hours by branch.",
  ),
];
