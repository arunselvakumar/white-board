import { DomainError } from "@/src/shared-kernel/domain-error";
import { isUuid } from "@/src/shared-kernel/ids";

/**
 * Where stock is held: a Project or a Central Store (ADR CM-0015 §5). Not a
 * `LocationRef`, which is a place inside a Project (Wing, Floor, Amenity …).
 */
export const STOCK_LOCATION_KINDS = ["project", "store"] as const;
export type StockLocationKind = (typeof STOCK_LOCATION_KINDS)[number];

export type StockLocation = { kind: StockLocationKind; id: string };

export function isStockLocationKind(value: string): value is StockLocationKind {
  return (STOCK_LOCATION_KINDS as readonly string[]).includes(value);
}

export function stockLocation(kind: string, id: string): StockLocation {
  if (!isStockLocationKind(kind) || !isUuid(id))
    throw new DomainError(
      "STOCK_LOCATION_INVALID",
      "Choose a Project or a Store.",
    );
  return { kind, id };
}

export function sameStockLocation(a: StockLocation, b: StockLocation): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/** A stable string for maps and locks: `project:<uuid>`. */
export function stockLocationKey(location: StockLocation): string {
  return `${location.kind}:${location.id}`;
}
