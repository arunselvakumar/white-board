import { z } from "zod";

import { projectDetailsFields } from "./project-models";

export const CreateConstructionProjectsProjectRequestModel =
  z.object(projectDetailsFields);

export type CreateConstructionProjectsProjectRequestModel = z.infer<
  typeof CreateConstructionProjectsProjectRequestModel
>;
