import { StatusCodes } from "http-status-codes";

import type { PreschoolOpenApi } from "../_lib/openapi";
import {
  SetUpPreschoolRequestModel,
  SetUpPreschoolResponseModel,
} from "./setup-models";

export const setupOpenApi: PreschoolOpenApi = {
  operations: [
    {
      method: "post",
      path: "/api/preschool/setup",
      summary:
        "Finish setting up a Preschool Workspace (Owner; safe to call again)",
      tags: ["Preschool"],
      body: SetUpPreschoolRequestModel,
      successStatus: StatusCodes.CREATED,
      successDescription:
        "The first Centre and current Academic Year. 200 with created false when it was already set up.",
      successSchema: SetUpPreschoolResponseModel,
      errors: [
        StatusCodes.BAD_REQUEST,
        StatusCodes.UNAUTHORIZED,
        StatusCodes.FORBIDDEN,
      ],
    },
  ],
  components: { SetUpPreschoolRequestModel, SetUpPreschoolResponseModel },
};
