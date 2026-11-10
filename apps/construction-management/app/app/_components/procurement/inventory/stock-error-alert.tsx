import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";

import { QueryHttpError } from "@/src/queries/http";
import { stockShortfalls } from "@/src/queries/inventory";

import { formatDate, formatQuantity } from "./inventory-format";

/**
 * A refused stock write. `STOCK_INSUFFICIENT` names each material, how
 * much is short and from which date (ADR CM-0015 §3), with the way out;
 * any other error is its message.
 */
export function StockErrorAlert({ error }: { error: unknown }) {
  if (error == null) return null;
  if (error instanceof QueryHttpError && error.code === "STOCK_INSUFFICIENT") {
    const shortfalls = stockShortfalls(error.details);
    return (
      <Alert variant="destructive" role="alert">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Not enough stock</AlertTitle>
        <AlertDescription>
          <ul className="space-y-0.5">
            {shortfalls.map((shortfall) => (
              <li key={`${shortfall.materialId}-${shortfall.onDate}`}>
                <span className="font-medium">
                  {shortfall.materialName ?? "A material"}
                </span>
                : {formatQuantity(shortfall.shortBy)} short on{" "}
                {formatDate(shortfall.onDate)}
              </li>
            ))}
          </ul>
          <p className="mt-1">
            Record the missing receipt or opening stock first, or lower the
            quantity.
          </p>
        </AlertDescription>
      </Alert>
    );
  }
  const message =
    error instanceof QueryHttpError
      ? error.message
      : "Something went wrong. Please try again.";
  return (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
  );
}
