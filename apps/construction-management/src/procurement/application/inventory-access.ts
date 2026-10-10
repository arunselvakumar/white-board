import { can, type Flag, type MemberAccess } from "@/src/shared-kernel/access";

import type { StockLocation } from "../domain/stock-location";

/**
 * Who may do what with stock at a location (CM-506). A Project's stock is
 * Current Inventory on that Project (`procurement.current_inventory`,
 * project-level); a Store's stock is the Central store menu
 * (`procurement.central_store`), which has only C R U D: printing,
 * reports and notifications there ride on Read.
 */
export function storeFlag(flag: Flag): Flag {
  switch (flag) {
    case "create":
    case "update":
    case "delete":
      return flag;
    case "import":
      return "create";
    case "approve":
    case "reject":
    case "transfer":
      return "update";
    default:
      return "read";
  }
}

/**
 * Current Inventory flags at a location. Import rides on Create and Export
 * Data on Print, as the menu has no I or E (`modules/06` → Permissions).
 */
export function canAtLocation(
  access: MemberAccess,
  location: StockLocation,
  flag: Flag,
): boolean {
  return location.kind === "project"
    ? can(access, "procurement.current_inventory", flag, {
        projectId: location.id,
      })
    : can(access, "procurement.central_store", storeFlag(flag));
}

/**
 * Material Transfer flags on one side of a transfer (CM-507): on a Project
 * the menu on that Project; on a Store the menu (Company-wide) and the
 * Central store menu too.
 */
export function canOnTransferSide(
  access: MemberAccess,
  side: StockLocation,
  flag: Flag,
): boolean {
  if (side.kind === "project")
    return can(access, "procurement.material_transfers", flag, {
      projectId: side.id,
    });
  return (
    can(access, "procurement.material_transfers", flag) &&
    can(access, "procurement.central_store", storeFlag(flag))
  );
}
