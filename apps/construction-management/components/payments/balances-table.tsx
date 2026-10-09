"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { HardHat, Users } from "lucide-react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { cn } from "@repo/ui/lib/utils";

import {
  partyBalancesQuery,
  type BalancePeriod,
  type PartyBalanceRow,
  type PaymentPartyType,
} from "@/src/queries/balances";

import { money, PARTY_NOUNS } from "./payment-format";

const FIGURES = [
  { key: "previousBalance", label: "Previous Balance" },
  { key: "toPay", label: "To Pay" },
  { key: "advance", label: "Advance" },
  { key: "paid", label: "Paid" },
  { key: "finalAmount", label: "Final Amount" },
] as const;

/**
 * The legacy payment figures per party for a period (CM-216): a table on
 * wider screens, cards on phones. A row opens the statement; Pay opens the
 * pay dialog.
 */
export function BalancesTable({
  projectId,
  partyType,
  period,
  onPay,
  onStatement,
}: {
  projectId: string;
  partyType: PaymentPartyType;
  period: BalancePeriod;
  onPay: (row: PartyBalanceRow) => void;
  onStatement: (row: PartyBalanceRow) => void;
}) {
  const { data } = useSuspenseQuery(
    partyBalancesQuery(projectId, partyType, period),
  );
  const nouns = PARTY_NOUNS[partyType];

  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {partyType === "labour" ? <Users /> : <HardHat />}
          </EmptyMedia>
          <EmptyTitle>No {nouns.many} to pay</EmptyTitle>
          <EmptyDescription>
            {partyType === "labour"
              ? "Labourers on this Project, and anyone who worked here in this period, show here. Add them in Masters → Labours."
              : "Vendors assigned to this Project, and any who worked here in this period, show here. Assign them in Masters → Vendors."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {data.items.length} {data.items.length === 1 ? nouns.one : nouns.many}
        {!data.financial && " · amounts need the Financial permission"}
      </p>
      <div className="hidden rounded-lg border md:block">
        <Table aria-label={`${nouns.title} balances`}>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              {FIGURES.map((figure) => (
                <TableHead key={figure.key} className="text-right">
                  {figure.label}
                </TableHead>
              ))}
              <TableHead className="w-20">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((row) => (
              <TableRow
                key={row.partyId}
                className="cursor-pointer"
                onClick={() => {
                  onStatement(row);
                }}
              >
                <TableCell className="font-medium">
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-left"
                    onClick={(event) => {
                      event.stopPropagation();
                      onStatement(row);
                    }}
                  >
                    {row.name}
                  </Button>
                  <PartyBadges row={row} />
                </TableCell>
                {FIGURES.map((figure) => (
                  <TableCell
                    key={figure.key}
                    className={cn(
                      "text-right tabular-nums",
                      figure.key === "finalAmount" && "font-semibold",
                    )}
                  >
                    {money(row[figure.key])}
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  <Button
                    type="button"
                    size="sm"
                    aria-label={`Pay ${row.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onPay(row);
                    }}
                  >
                    Pay
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">Total</TableCell>
              {FIGURES.map((figure) => (
                <TableCell
                  key={figure.key}
                  className="text-right font-semibold tabular-nums"
                >
                  {money(data.totals[figure.key])}
                </TableCell>
              ))}
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      <ul
        aria-label={`${nouns.title} balances`}
        className="space-y-2 md:hidden"
      >
        {data.items.map((row) => (
          <li key={row.partyId} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{row.name}</p>
                <PartyBadges row={row} />
              </div>
              <div className="text-right">
                <p className="text-muted-foreground text-xs">Final Amount</p>
                <p className="font-semibold tabular-nums">
                  {money(row.finalAmount)}
                </p>
              </div>
            </div>
            <dl className="text-muted-foreground mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {FIGURES.slice(0, 4).map((figure) => (
                <div key={figure.key} className="flex justify-between gap-2">
                  <dt>{figure.label}</dt>
                  <dd className="text-foreground tabular-nums">
                    {money(row[figure.key])}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  onStatement(row);
                }}
              >
                Statement
              </Button>
              <Button
                type="button"
                size="sm"
                className="flex-1"
                aria-label={`Pay ${row.name}`}
                onClick={() => {
                  onPay(row);
                }}
              >
                Pay
              </Button>
            </div>
          </li>
        ))}
        <li className="bg-muted/40 flex justify-between rounded-lg border p-3 text-sm font-semibold">
          <span>Total Final Amount</span>
          <span className="tabular-nums">{money(data.totals.finalAmount)}</span>
        </li>
      </ul>
    </div>
  );
}

function PartyBadges({ row }: { row: PartyBalanceRow }) {
  if (row.isActive && row.onProject && row.code == null) return null;
  return (
    <span className="mt-0.5 flex flex-wrap gap-1">
      {row.code != null && (
        <span className="text-muted-foreground text-xs">{row.code}</span>
      )}
      {!row.onProject && <Badge variant="outline">Other Project</Badge>}
      {!row.isActive && <Badge variant="outline">Inactive</Badge>}
    </span>
  );
}
