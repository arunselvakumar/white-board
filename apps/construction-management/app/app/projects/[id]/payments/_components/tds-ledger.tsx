"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import { Suspense, useState, useTransition } from "react";
import { Badge } from "@repo/ui/components/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { cn } from "@repo/ui/lib/utils";

import { counterpartyOptionsQuery } from "@/src/queries/finance-lookups";
import { tdsLedgerQuery } from "@/src/queries/finance-parties";

import {
  financialYearLabel,
  financialYearOf,
  formatDate,
  localToday,
  money,
} from "./party-money";
import { SelectControlSkeleton } from "@/components/finance/finance-skeletons";

import { TDS_COLUMNS, TdsLedgerSkeleton } from "./parties-skeletons";

const PAYEE_LABELS = {
  individual_huf: "Individual / HUF — 1%",
  other: "Firm/Company/other — 2%",
  no_pan: "No PAN — 20%",
} as const;

/**
 * The TDS ledger (CM-706, CM-0017 §8): a Contractor's payments in a
 * financial year across the Projects you can see, with base, rate, TDS
 * and overrides, and the totals by quarter for filing.
 */
export function TdsLedgerView({
  projectId,
  today,
}: {
  projectId: string;
  today?: string;
}) {
  const contractors = useQuery(
    counterpartyOptionsQuery("contractor", projectId),
  );
  const current = financialYearOf(today ?? localToday());
  const years = [current, current - 1, current - 2];
  const [contractorId, setContractorId] = useState<string>("");
  const [year, setYear] = useState(current);
  const [updating, startTransition] = useTransition();
  const items = (contractors.data?.items ?? []).map((item) => ({
    value: item.id,
    label: item.name,
  }));
  const yearItems = years.map((item) => ({
    value: String(item),
    label: `FY ${financialYearLabel(item)}`,
  }));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="tds-contractor">Contractor</Label>
          {contractors.isPending ? (
            <SelectControlSkeleton label="Loading Contractors" />
          ) : (
            <Select
              items={items}
              value={contractorId === "" ? null : contractorId}
              onValueChange={(next) => {
                if (typeof next === "string")
                  startTransition(() => {
                    setContractorId(next);
                  });
              }}
            >
              <SelectTrigger id="tds-contractor" className="w-full min-w-0">
                <SelectValue placeholder="Choose a Contractor" />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="tds-year">Financial year</Label>
          <Select
            items={yearItems}
            value={String(year)}
            onValueChange={(next) => {
              if (typeof next === "string")
                startTransition(() => {
                  setYear(Number(next));
                });
            }}
          >
            <SelectTrigger id="tds-year" className="w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {yearItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {contractorId === "" ? (
        <p className="bg-card text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
          Choose a Contractor to see the TDS deducted from their payments.
        </p>
      ) : (
        <div className={cn(updating && "opacity-60 transition-opacity")}>
          <Suspense fallback={<TdsLedgerSkeleton />}>
            <Ledger contractorId={contractorId} year={year} />
          </Suspense>
        </div>
      )}
    </div>
  );
}

function Ledger({
  contractorId,
  year,
}: {
  contractorId: string;
  year: number;
}) {
  const { data } = useSuspenseQuery(tdsLedgerQuery(contractorId, year));
  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="text-muted-foreground">PAN </span>
        {data.contractor.pan ?? "not recorded"} ·{" "}
        {PAYEE_LABELS[data.contractor.payeeKind]}
      </p>
      <section aria-labelledby="tds-quarters" className="space-y-2">
        <h3 id="tds-quarters" className="text-sm font-semibold">
          By quarter
        </h3>
        <ul
          aria-label="Quarter totals"
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        >
          {data.quarters.map((quarter) => (
            <li key={quarter.quarter} className="bg-card rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">{quarter.label}</p>
              <p className="font-semibold tabular-nums">{money(quarter.tds)}</p>
              <p className="text-muted-foreground text-xs tabular-nums">
                on {money(quarter.base)} · {quarter.payments}{" "}
                {quarter.payments === 1 ? "payment" : "payments"}
              </p>
            </li>
          ))}
        </ul>
        <p className="text-sm">
          Year total{" "}
          <span className="font-semibold tabular-nums">
            {money(data.totals.tds)}
          </span>{" "}
          on {money(data.totals.base)}
        </p>
      </section>
      {data.rows.length === 0 ? (
        <Empty className="bg-card border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Receipt />
            </EmptyMedia>
            <EmptyTitle>No payments this year</EmptyTitle>
            <EmptyDescription>
              Payments to the Contractor in FY {financialYearLabel(year)} show
              here with their TDS.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="bg-card hidden overflow-x-auto rounded-lg border md:block">
            <Table aria-label="TDS ledger">
              <TableHeader>
                <TableRow>
                  {TDS_COLUMNS.map((column, index) => (
                    <TableHead key={index} className={column.className}>
                      {column.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.paymentId}>
                    <TableCell className="font-medium">
                      {row.number}
                      {row.overridden && (
                        <Badge variant="outline" className="ml-2">
                          Changed
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(row.paymentDate)}</TableCell>
                    <TableCell>{row.project?.name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(row.paid)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(row.base)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.rate == null ? "—" : `${row.rate}%`}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {money(row.tds)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul aria-label="TDS ledger" className="space-y-2 md:hidden">
            {data.rows.map((row) => (
              <li
                key={row.paymentId}
                className="bg-card rounded-lg border p-3 text-sm"
              >
                <div className="flex justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">
                    {row.number}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {money(row.tds)}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">
                  {formatDate(row.paymentDate)} · {row.project?.name ?? "—"} ·
                  paid {money(row.paid)}
                  {row.rate != null && ` · ${row.rate}%`}
                  {row.overridden && " · changed"}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
