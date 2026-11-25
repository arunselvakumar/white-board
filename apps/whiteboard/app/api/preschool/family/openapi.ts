import { StatusCodes } from "http-status-codes";

import type { PreschoolOpenApi } from "../_lib/openapi";
import { PreschoolFamilyHomeResponseModel } from "./family-models";

export const familyOpenApi: PreschoolOpenApi = {
  operations: [
    {
      method: "get",
      path: "/api/preschool/family/home",
      summary: "A Parent's Home: their Children today (Parent)",
      tags: ["Preschool"],
      successStatus: StatusCodes.OK,
      successDescription:
        "Each Child's attendance today, latest published Daily Report and fees",
      successSchema: PreschoolFamilyHomeResponseModel,
      errors: [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN],
    },
  ],
  components: { PreschoolFamilyHomeResponseModel },
};
