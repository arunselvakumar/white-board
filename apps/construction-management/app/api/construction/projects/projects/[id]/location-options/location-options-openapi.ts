import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import { ConstructionProjectsProjectParamsModel } from "../../project-models";
import { ConstructionProjectsLocationOptionsResponseModel } from "./location-options-models";

/** The location picker's model (CM-403). */
export const locationOptionsOpenApiComponents: OpenApiComponents = {
  ConstructionProjectsLocationOptionsResponseModel,
};

/** The location picker's read (CM-403), under the `projects.project` menu. */
export const locationOptionsOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: "/api/construction/projects/projects/{id}/location-options",
    summary:
      "What a site entry's location picker offers: Location Types with rows, Wings with Floors and Units, enabled Amenities and Common Developments, Locations",
    tags: ["Construction · Projects"],
    params: ConstructionProjectsProjectParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Location options",
    successSchema: ConstructionProjectsLocationOptionsResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
    ],
  },
];
