import type { PartyFileRouteConfig } from "@/app/api/construction/labour/_party-files/party-file-routes";
import { createLabourHandlers } from "@/src/labour/infrastructure/create-labour-handlers";

import { LABOURS_PATH } from "./labour-models";

/** One composition for every Labour route (CM-207). */
export const labour = createLabourHandlers();

/** Photo and documents of a labourer: the register's Menu, `labour` owner. */
export const LABOUR_FILES: PartyFileRouteConfig = {
  ownerType: "labour",
  menu: "masters.labours",
  basePath: LABOURS_PATH,
};
