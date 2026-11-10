"use client";

import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";

import { QueryHttpError } from "@/src/queries/http";

import { formatDate, qty } from "./goods-receipt-parts";

type Shortfall = {
  materialId: string;
  materialName: string | null;
  shortBy: string;
  onDate: string;
};

/** The shortfalls of a 409 `STOCK_INSUFFICIENT`, or null for any other error. */
export function stockShortfalls(error: unknown): Shortfall[] | null {
  if (!(error instanceof QueryHttpError) || error.code !== "STOCK_INSUFFICIENT")
    return null;
  const details = error.details as { shortfalls?: Shortfall[] } | undefined;
  return details?.shortfalls ?? [];
}

/**
 * Why an edit or delete of a GRN was refused for stock (CM-0015 §3): the
 * stock it brought in has already been consumed, moved or issued.
 */
export function StockShortfallAlert({
  shortfalls,
  action,
}: {
  shortfalls: readonly Shortfall[];
  action: "edit" | "delete";
}) {
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>
        {action === "edit"
          ? "Not enough stock to save this change"
          : "Not enough stock to delete this Goods Receipt"}
      </AlertTitle>
      <AlertDescription>
        <p>
          Some of the stock this Goods Receipt brought in has already been used,
          moved or issued. Stock cannot go below zero on any date.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {shortfalls.map((shortfall) => (
            <li key={`${shortfall.materialId}:${shortfall.onDate}`}>
              {shortfall.materialName ?? "A material"}: {qty(shortfall.shortBy)}{" "}
              short on {formatDate(shortfall.onDate)}
            </li>
          ))}
        </ul>
        <p className="mt-2">
          Record the missing receipt or an opening stock first, or receive at
          least what has gone out.
        </p>
      </AlertDescription>
    </Alert>
  );
}

/** A server error's line (`details.index`), 1-based, if it names one. */
export function errorLine(error: unknown): number | null {
  if (!(error instanceof QueryHttpError)) return null;
  const index = (error.details as { index?: unknown } | undefined)?.index;
  return typeof index === "number" ? index + 1 : null;
}
