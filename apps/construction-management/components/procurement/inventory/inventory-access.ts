"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { storeFlag } from "@/src/procurement/application/inventory-access";
import type { StockLocation } from "@/src/procurement/domain/stock-location";
import type { Flag } from "@/src/shared-kernel/access";
import {
  canIn,
  procurementAccessQuery,
} from "@/src/queries/procurement-access";

/**
 * What the viewer may do with stock at a location, as the server decides
 * it (`canAtLocation`): Current Inventory on a Project, Central store on a
 * Store. Only for hiding actions; every route checks again.
 */
export function useInventoryCan(
  location: StockLocation,
): (flag: Flag) => boolean {
  const { data } = useSuspenseQuery(
    procurementAccessQuery(location.kind === "project" ? location.id : null),
  );
  return (flag) =>
    location.kind === "project"
      ? canIn(data, "procurement.current_inventory", flag)
      : canIn(data, "procurement.central_store", storeFlag(flag));
}
