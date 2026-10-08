import { z } from "zod";

import { PermissionGrantsModel } from "../../team-member-models";

export const SetConstructionOrganizationTeamMemberPermissionsRequestModel =
  z.object({ permissions: PermissionGrantsModel });
