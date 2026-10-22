"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { HardHat } from "lucide-react";
import Link from "next/link";
import { Badge } from "@repo/ui/components/badge";
import { buttonVariants } from "@repo/ui/components/button";
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
  type PartyBalance,
  type PartyType,
} from "@/src/queries/finance-parties";

import { money, PARTY_SCREENS, partyPaths } from "./party-money";

type Figure = Exclude<keyof PartyBalance, "party" | "assigned">;

export const COLUMNS: Record<PartyType, { key: Figure; label: string }[]> = {
  contractor: [
    { key: "opening", label: "Opening" },
    { key: "invoiced", label: "Invoiced" },
    { key: "paid", label: "Paid" },
    { key: "tds", label: "TDS" },
    { key: "writtenOff", label: "Written off" },
    { key: "balance", label: "Balance" },
    { key: "overdue", label: "Overdue" },
    { key: "advance", label: "Advance" },
  ],
  supplier: [
    { key: "opening", label: "Opening" },
    { key: "invoiced", label: "Invoiced" },
    { key: "paid", label: "Paid" },
    { key: "writtenOff", label: "Written off" },
    { key: "balance", label: "Balance" },
    { key: "overdue", label: "Overdue" },
    { key: "advance", label: "Advance" },
  ],
  other_party: [
    { key: "opening", label: "Opening" },
    { key: "invoiced", label: "Bills" },
    { key: "billed", label: "Sales" },
    { key: "paid", label: "Paid" },
    { key: "received", label: "Received" },
    { key: "writtenOff", label: "Written off" },
    { key: "balance", label: "Balance" },
    { key: "overdue", label: "Overdue" },
  ],
  // CM-1107: what the Client owes ("Due", the balance turned round), what
  // it deducted, and the retention it holds (derived in contracts).
  client: [
    { key: "opening", label: "Opening" },
    { key: "billed", label: "Invoiced" },
    { key: "received", label: "Received" },
    { key: "clientTds", label: "TDS receivable" },
    { key: "gstTds", label: "GST-TDS receivable" },
    { key: "writtenOff", label: "Written off" },
    { key: "balance", label: "Due" },
    { key: "overdue", label: "Overdue" },
    { key: "retentionReceivable", label: "Retention receivable" },
  ],
};

/**
 * Written off is posted signed (− on bills); the table shows its size. A
 * Client's balance is what it owes the Company, so "Due" turns it round.
 */
function shown(
  row: Pick<PartyBalance, Figure>,
  key: Figure,
  partyType: PartyType,
): number {
  if (key === "writtenOff") return Math.abs(row[key]);
  if (key === "balance" && partyType === "client") return -row[key];
  return row[key];
}

/**
 * Each party's money on the Project (CM-705, CM-706): a table on wider
 * screens, cards on phones. The name opens the party; Pay records a
 * payment. A positive balance is owed to the party.
 */
export function PartyBalances({
  projectId,
  partyType,
  canPay,
}: {
  projectId: string;
  partyType: PartyType;
  canPay: boolean;
}) {
  const { data } = useSuspenseQuery(partyBalancesQuery(projectId, partyType));
  const screen = PARTY_SCREENS[partyType];
  const paths = partyPaths(projectId, partyType);
  const columns = COLUMNS[partyType];
  const client = partyType === "client";
  const action = client ? "Receive" : "Pay";

  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HardHat />
          </EmptyMedia>
          <EmptyTitle>No {screen.plural} on this Project</EmptyTitle>
          <EmptyDescription>
            {client
              ? "The Project's Client shows here once it is linked on the Project. Its invoices come from approved Client Bills."
              : `${screen.plural} assigned to the Project, and any with invoices or payments here, show with their balances. Assign them under the Project's Resources.`}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {data.items.length}{" "}
        {data.items.length === 1 ? screen.label : screen.plural} ·{" "}
        {client
          ? "Due is what the Client owes; retention receivable is held back on approved Client Bills"
          : "a positive balance is owed to the party"}
      </p>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table aria-label={`${screen.label} balances`}>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              {columns.map((column) => (
                <TableHead key={column.key} className="text-right">
                  {column.label}
                </TableHead>
              ))}
              {canPay && (
                <TableHead className="w-20">
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((row) => (
              <TableRow key={row.party.id}>
                <TableCell className="font-medium">
                  <Link
                    href={paths.party(row.party.id)}
                    className="hover:underline"
                  >
                    {row.party.name ?? `A removed ${screen.label}`}
                  </Link>
                  {!row.assigned && (
                    <Badge variant="outline" className="ml-2">
                      Not on Project
                    </Badge>
                  )}
                </TableCell>
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn(
                      "text-right tabular-nums",
                      column.key === "balance" && "font-semibold",
                      column.key === "overdue" &&
                        row.overdue > 0 &&
                        "text-destructive",
                    )}
                  >
                    {money(shown(row, column.key, partyType))}
                  </TableCell>
                ))}
                {canPay && (
                  <TableCell className="text-right">
                    <Link
                      href={paths.pay(row.party.id)}
                      aria-label={`${action} ${row.party.name ?? screen.label}`}
                      className={buttonVariants({ size: "sm" })}
                    >
                      {action}
                    </Link>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">Total</TableCell>
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  className="text-right font-semibold tabular-nums"
                >
                  {money(shown(data.totals, column.key, partyType))}
                </TableCell>
              ))}
              {canPay && <TableCell />}
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      <ul
        aria-label={`${screen.label} balances`}
        className="space-y-2 md:hidden"
      >
        {data.items.map((row) => (
          <li key={row.party.id} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={paths.party(row.party.id)}
                  className="block truncate font-medium hover:underline"
                >
                  {row.party.name ?? `A removed ${screen.label}`}
                </Link>
                {!row.assigned && (
                  <Badge variant="outline">Not on Project</Badge>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-muted-foreground text-xs">
                  {client ? "Due" : "Balance"}
                </p>
                <p className="font-semibold tabular-nums">
                  {money(shown(row, "balance", partyType))}
                </p>
              </div>
            </div>
            <dl className="text-muted-foreground mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {columns
                .filter((column) => column.key !== "balance")
                .map((column) => (
                  <div
                    key={column.key}
                    className="flex min-w-0 justify-between gap-2"
                  >
                    <dt>{column.label}</dt>
                    <dd className="text-foreground tabular-nums">
                      {money(shown(row, column.key, partyType))}
                    </dd>
                  </div>
                ))}
            </dl>
            {canPay && (
              <Link
                href={paths.pay(row.party.id)}
                aria-label={`${action} ${row.party.name ?? screen.label}`}
                className={buttonVariants({
                  size: "sm",
                  className: "mt-3 w-full",
                })}
              >
                {action}
              </Link>
            )}
          </li>
        ))}
        <li className="bg-muted/40 flex justify-between rounded-lg border p-3 text-sm font-semibold">
          <span>{client ? "Total due" : "Total balance"}</span>
          <span className="tabular-nums">
            {money(shown(data.totals, "balance", partyType))}
          </span>
        </li>
      </ul>
    </div>
  );
}
