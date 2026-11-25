// What the Preschool stock screens show. Pure, so it can be tested.

import type { PreschoolStockMovement } from "@/src/queries/preschool/stock";

/** Units offered as one-tap picks on the Stock Item form. */
export const STOCK_UNIT_PICKS = [
  "piece",
  "set",
  "box",
  "packet",
  "pair",
] as const;

/** "+20" or "−4", with a true minus sign. */
export function formatQuantityDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

/** Who or where a movement went to or came from, in a few words. */
export function stockCounterparty(
  movement: Pick<
    PreschoolStockMovement,
    | "kind"
    | "child"
    | "classroom"
    | "staff"
    | "otherCentre"
    | "supplierName"
    | "billNumber"
  >,
): string | null {
  switch (movement.kind) {
    case "issued_to_child":
      return movement.child?.name ?? null;
    case "issued_to_classroom":
      return movement.classroom?.name ?? null;
    case "issued_to_staff":
      return movement.staff?.name ?? null;
    case "transfer_out":
      return movement.otherCentre == null
        ? null
        : `To ${movement.otherCentre.name}`;
    case "transfer_in":
      return movement.otherCentre == null
        ? null
        : `From ${movement.otherCentre.name}`;
    case "received": {
      const parts = [
        movement.supplierName,
        movement.billNumber == null ? null : `Bill ${movement.billNumber}`,
      ].filter((part): part is string => part != null && part !== "");
      return parts.length === 0 ? null : parts.join(" · ");
    }
    case "adjusted":
      return null;
  }
}

/**
 * The form row a `STOCK_INSUFFICIENT` message is about: the API names the
 * item ("Only 3 set of Nursery kit in stock…"). −1 when no row matches.
 */
export function insufficientStockRow(
  message: string,
  itemNames: readonly (string | null)[],
): number {
  let best = -1;
  let bestLength = 0;
  itemNames.forEach((name, index) => {
    if (
      name != null &&
      name.length > bestLength &&
      message.includes(` of ${name} `)
    ) {
      best = index;
      bestLength = name.length;
    }
  });
  return best;
}
