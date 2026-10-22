import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Badge } from "@repo/ui/components/badge";

import type { Side } from "@/src/contracts/domain/contract-terms";

import { percentText, quantity } from "./measurement-format";

/** One item as the panel shows it; quantities as four-place strings. */
export type CumulativeItem = {
  itemId: string;
  itemNo: string | null;
  description: string;
  uomName: string;
  planned: string;
  checked: string;
  thisSheet: string;
  total: string;
  over: boolean;
  overLimit: boolean;
  percentOver: string | null;
};

/**
 * Per item of the sheet: what checked sheets measured before, this sheet,
 * and the total against the BOQ's current quantity (client side) or the
 * Work Order line (contractor side). Client items over their quantity are
 * a **deviation**; past the Company's limit they link to the BOQ's
 * Deviations tab. Contractor lines over the Work Order are warned: a bill
 * refuses the extra.
 */
export function MeasurementCumulative({
  side,
  items,
  limit,
  deviationsHref,
  waiting = null,
}: {
  side: Side;
  items: readonly CumulativeItem[];
  /** The Company's deviation limit, `"25.00"` (client side). */
  limit: string | null;
  deviationsHref: string;
  /** Why nothing can be totalled yet (no Work Order picked). */
  waiting?: string | null;
}) {
  const planned = side === "client" ? "BOQ qty" : "WO qty";
  return (
    <section
      aria-labelledby="measurement-cumulative"
      className="min-w-0 space-y-3 rounded-xl border p-4"
    >
      <div className="space-y-1">
        <h3 id="measurement-cumulative" className="font-semibold">
          Measured to date
        </h3>
        <p className="text-muted-foreground text-sm">
          {side === "client"
            ? `Checked sheets plus this one, against each BOQ item's current quantity. Over it is a deviation; past ${percentText(limit)} the item needs a Variation.`
            : "Checked sheets plus this one, against each Work Order line. A bill refuses more than the Work Order holds: amend it first."}
        </p>
      </div>
      {waiting != null ? (
        <p className="text-muted-foreground text-sm">{waiting}</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Add a row to see each item’s total.
        </p>
      ) : (
        <ul aria-label="Measured to date" className="divide-y">
          {items.map((item) => (
            <li
              key={item.itemId}
              className="flex min-w-0 flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium break-words">
                  {item.itemNo == null ? "" : `${item.itemNo} · `}
                  {item.description}
                </p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {`Before ${quantity(item.checked)} + this sheet ${quantity(item.thisSheet)} = `}
                  <span className="text-foreground font-medium">
                    {`${quantity(item.total)} ${item.uomName}`}
                  </span>
                  {` of ${quantity(item.planned)} (${planned})`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {item.over ? (
                  <Badge variant="destructive">
                    <TriangleAlert aria-hidden="true" />
                    {side === "client"
                      ? `Deviation +${percentText(item.percentOver)}`
                      : `Over the Work Order +${percentText(item.percentOver)}`}
                  </Badge>
                ) : (
                  <Badge variant="secondary">Within</Badge>
                )}
                {side === "client" && item.overLimit ? (
                  <Link
                    href={deviationsHref}
                    className="text-sm font-medium underline-offset-4 hover:underline"
                  >
                    Past the limit · Deviations
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
