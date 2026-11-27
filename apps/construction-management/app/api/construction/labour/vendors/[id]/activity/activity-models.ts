import { z } from "zod";

import {
  DATES_IN_ORDER,
  datesInOrder,
  personActivityQueryFields,
  vendorActivityPageModel,
} from "@/app/api/construction/labour/_activity/activity-fields";
import { PERSON_ACTIVITY_TYPES } from "@/src/composition/person-activity";

export const ListConstructionLabourVendorActivityRequestModel = z
  .object({
    type: z
      .enum(PERSON_ACTIVITY_TYPES)
      .default("all")
      .describe(
        "projects: added to or removed from a Project; check_ins: each Check In and Check Out (Attendance Read on the Project).",
      ),
    ...personActivityQueryFields,
  })
  .refine(datesInOrder, DATES_IN_ORDER);

export const ListConstructionLabourVendorActivityResponseModel =
  vendorActivityPageModel;
