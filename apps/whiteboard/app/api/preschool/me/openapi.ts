import { StatusCodes } from "http-status-codes";

import type { PreschoolOpenApi } from "../_lib/openapi";
import { PreschoolMeResponseModel } from "./me-models";

export const meOpenApi: PreschoolOpenApi = {
  operations: [
    {
      method: "get",
      path: "/api/preschool/me",
      summary: "Who the User is in this Preschool and what they may open",
      tags: ["Preschool"],
      successStatus: StatusCodes.OK,
      successDescription: "Role, Centres, Classrooms and Children",
      successSchema: PreschoolMeResponseModel,
      errors: [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN],
    },
  ],
  components: { PreschoolMeResponseModel },
};
