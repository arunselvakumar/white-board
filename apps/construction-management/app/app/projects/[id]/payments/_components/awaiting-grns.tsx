"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Label } from "@repo/ui/components/label";

import {
  awaitingGoodsReceiptsQuery,
  type AwaitingGoodsReceipt,
} from "@/src/queries/finance-parties";

import { formatDate, money } from "./party-money";

/**
 * GRNs on the Project with no supplier invoice yet (CM-0017 §13): tick
 * one or more of the same Supplier and **Create invoice** gathers them.
 */
export function AwaitingGrns({
  projectId,
  canCreate,
  onCreate,
}: {
  projectId: string;
  canCreate: boolean;
  onCreate: (grns: AwaitingGoodsReceipt[]) => void;
}) {
  const { data } = useSuspenseQuery(awaitingGoodsReceiptsQuery(projectId));
  const [chosen, setChosen] = useState<string[]>([]);
  if (data.items.length === 0) return null;
  const picked = data.items.filter((grn) => chosen.includes(grn.id));
  const supplier = picked[0]?.supplier.id ?? null;
  const mixed = picked.some((grn) => grn.supplier.id !== supplier);
  return (
    <section
      aria-labelledby="awaiting-grns"
      className="bg-card space-y-3 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="awaiting-grns" className="font-semibold">
            GRNs awaiting invoice
          </h2>
          <p className="text-muted-foreground text-sm">
            Goods received without a supplier invoice. Tick those of one
            Supplier to raise its invoice.
          </p>
        </div>
        {canCreate && (
          <Button
            size="sm"
            disabled={picked.length === 0 || mixed}
            onClick={() => {
              onCreate(picked);
              setChosen([]);
            }}
          >
            Create invoice
          </Button>
        )}
      </div>
      {mixed && (
        <p className="text-destructive text-sm">Choose GRNs of one Supplier.</p>
      )}
      <ul
        aria-label="GRNs awaiting invoice"
        className="bg-card divide-y rounded-lg border"
      >
        {data.items.map((grn) => (
          <li key={grn.id} className="flex items-center gap-3 p-3 text-sm">
            {canCreate && (
              <Checkbox
                id={`grn-${grn.id}`}
                checked={chosen.includes(grn.id)}
                onCheckedChange={(next) => {
                  setChosen((current) =>
                    next
                      ? [...current, grn.id]
                      : current.filter((id) => id !== grn.id),
                  );
                }}
              />
            )}
            <Label
              htmlFor={`grn-${grn.id}`}
              className="flex min-w-0 flex-1 flex-wrap justify-between gap-x-3 font-normal"
            >
              <span className="min-w-0">
                <span className="font-medium">{grn.number}</span> ·{" "}
                {grn.supplier.name} · {formatDate(grn.receiptDate)}
                {grn.invoiceNo != null && ` · invoice ${grn.invoiceNo}`}
              </span>
              <span className="tabular-nums">{money(grn.totalValue)}</span>
            </Label>
          </li>
        ))}
      </ul>
    </section>
  );
}
