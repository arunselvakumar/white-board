import { z } from "zod";

import {
  DATES_IN_ORDER,
  datesInOrder,
  personActivityPageModel,
  personActivityQueryFields,
} from "@/app/api/construction/labour/labours/[id]/activity/activity-models";
import { PERSON_ACTIVITY_TYPES } from "@/src/composition/person-activity";

export const ListConstructionMastersSiteEngineerActivityRequestModel = z
  .object({
    type: z
      .enum(PERSON_ACTIVITY_TYPES)
      .default("all")
      .describe(
        "projects: their sign-in added to or removed from a Project; check_ins: each Check In and Check Out (Attendance Read on the Project).",
      ),
    ...personActivityQueryFields,
  })
  .refine(datesInOrder, DATES_IN_ORDER);

export const ListConstructionMastersSiteEngineerActivityResponseModel =
  personActivityPageModel();
