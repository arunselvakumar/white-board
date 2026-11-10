"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Badge } from "@repo/ui/components/badge";

import { storeFlag } from "@/src/procurement/application/inventory-access";
import {
  TRANSFER_STATUS_LABELS,
  type TransferStatus,
} from "@/src/procurement/domain/material-transfer";
import type { StockLocation } from "@/src/procurement/domain/stock-location";
import type { Flag } from "@/src/shared-kernel/access";
import {
  canIn,
  procurementAccessQuery,
} from "@/src/queries/procurement-access";

const STATUS_STYLE: Record<
  TransferStatus,
  { variant: "secondary" | "outline" | "destructive"; className?: string }
> = {
  pending: {
    variant: "outline",
    className:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  },
  in_transit: {
    variant: "outline",
    className:
      "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200",
  },
  delivered: { variant: "secondary" },
  rejected: { variant: "destructive" },
};

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <Badge variant={style.variant} className={style.className}>
      {TRANSFER_STATUS_LABELS[status]}
    </Badge>
  );
}

/**
 * Material Transfer flags on one side, as the server decides them
 * (`canOnTransferSide`): the menu on a Project; on a Store the menu and
 * Central store too. Only for hiding actions.
 */
export function useTransferSideCan(
  side: StockLocation,
): (flag: Flag) => boolean {
  const { data: onSide } = useSuspenseQuery(
    procurementAccessQuery(side.kind === "project" ? side.id : null),
  );
  return (flag) =>
    side.kind === "project"
      ? canIn(onSide, "procurement.material_transfers", flag)
      : canIn(onSide, "procurement.material_transfers", flag) &&
        canIn(onSide, "procurement.central_store", storeFlag(flag));
}

/** `project:<id>` / `store:<id>`, for selects. */
export function locationValue(location: StockLocation): string {
  return `${location.kind}:${location.id}`;
}

export function parseLocationValue(value: string): StockLocation | null {
  const [kind, id] = value.split(":");
  if ((kind !== "project" && kind !== "store") || id == null || id === "")
    return null;
  return { kind, id };
}
