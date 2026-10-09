import type { PartyFileRouteConfig } from "@/app/api/construction/labour/_party-files/party-file-routes";
import { createVendorHandlers } from "@/src/labour/infrastructure/create-vendor-handlers";

import { VENDORS_PATH } from "./vendor-models";

/** One set of vendor handlers for every vendor route. */
export const vendorHandlers = createVendorHandlers();

/** Photo and documents of a vendor: the register's Menu, `vendor` owner. */
export const VENDOR_FILES: PartyFileRouteConfig = {
  ownerType: "vendor",
  menu: "masters.vendors",
  basePath: VENDORS_PATH,
};
