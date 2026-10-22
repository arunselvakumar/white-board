"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { partyBalancesQuery } from "@/src/queries/finance-parties";

import { money } from "./party-money";

/**
 * A Client's balance on the Project (CM-1107): what it owes now (due),
 * the retention it holds back on approved Client Bills (derived in
 * contracts, released later), and the TDS and GST-TDS it deducted from
 * receipts, which the Company recovers through its returns (Form 26AS,
 * GSTR-2X).
 */
export function ClientReceivables({
  projectId,
  partyId,
}: {
  projectId: string;
  partyId: string;
}) {
  const { data } = useSuspenseQuery(partyBalancesQuery(projectId, "client"));
  const row = data.items.find((item) => item.party.id === partyId);
  if (row == null) return null;
  const figures: [string, number, string][] = [
    [
      "Due",
      -row.balance,
      "Invoiced less received, TDS, GST-TDS and write-offs.",
    ],
    [
      "Retention receivable",
      row.retentionReceivable,
      "Held back on approved Client Bills until it is released.",
    ],
    [
      "TDS receivable",
      row.clientTds,
      "Deducted by the Client from receipts: claim it against Form 26AS.",
    ],
    [
      "GST-TDS receivable",
      row.gstTds,
      "Deducted under s.51 by a government Client: credited to the electronic cash ledger.",
    ],
  ];
  return (
    <section
      aria-label="Client receivables"
      className="grid min-w-0 grid-cols-2 gap-3 rounded-xl border p-4 sm:grid-cols-4"
    >
      {figures.map(([label, value, note]) => (
        <div key={label} className="min-w-0 space-y-0.5">
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="text-base font-semibold break-words tabular-nums">
            {money(value)}
          </p>
          <p className="text-muted-foreground text-xs">{note}</p>
        </div>
      ))}
    </section>
  );
}
