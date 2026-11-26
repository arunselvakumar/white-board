"use client";

import { PackageIcon } from "@phosphor-icons/react/ssr";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { EmptyState } from "@repo/ui/components/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { TableCard } from "@/app/(app)/preschool/_components/table-card";

import { feeDateLabel } from "@/lib/preschool-fees";
import { STOCK_CATEGORY_LABELS } from "@/src/queries/preschool/stock";

import type { StockDialog } from "./stock-movement-dialogs";
import type { StockRow } from "./stock-lines-field";

/** Stock on hand at the Centre, with Issue, Receive, Adjust and the ledger. */
export function StockTable({
  rows,
  filtered,
  onAction,
}: {
  rows: readonly StockRow[];
  /** A filter is on, so an empty table means nothing matched. */
  filtered: boolean;
  onAction: (dialog: StockDialog) => void;
}) {
  if (rows.length === 0)
    return (
      <EmptyState
        className="border"
        size="md"
        icon={PackageIcon}
        tone={filtered ? "neutral" : "orange"}
        orbit={!filtered}
        title={filtered ? "Nothing matches" : "No Stock Items"}
        description={
          filtered
            ? "Try another category or turn off Low stock only."
            : "Add Stock Items to start counting stock."
        }
      />
    );
  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="hidden sm:table-cell">Category</TableHead>
            <TableHead className="text-right">On hand</TableHead>
            <TableHead className="hidden text-right sm:table-cell">
              Reorder at
            </TableHead>
            <TableHead className="hidden md:table-cell">
              Last movement
            </TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.itemId}>
              <TableCell>
                <Link
                  href={`/preschool/stock/items/${row.itemId}`}
                  className="font-medium hover:underline"
                >
                  {row.name}
                </Link>
                <div className="text-muted-foreground text-xs sm:hidden">
                  {STOCK_CATEGORY_LABELS[row.category]}
                </div>
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {STOCK_CATEGORY_LABELS[row.category]}
              </TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums">
                <span className="inline-flex items-center gap-1.5">
                  {row.low ? <Badge variant="destructive">Low</Badge> : null}
                  {row.onHand} {row.unit}
                </span>
              </TableCell>
              <TableCell className="hidden text-right tabular-nums sm:table-cell">
                {row.reorderLevel ?? "—"}
              </TableCell>
              <TableCell className="hidden whitespace-nowrap md:table-cell">
                {row.lastMovedOn == null ? "—" : feeDateLabel(row.lastMovedOn)}
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Actions for ${row.name}`}
                      />
                    }
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={row.onHand === 0}
                      onClick={() => {
                        onAction({ kind: "issue", itemId: row.itemId });
                      }}
                    >
                      Issue
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        onAction({ kind: "receive", itemId: row.itemId });
                      }}
                    >
                      Receive
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        onAction({ kind: "adjust", itemId: row.itemId });
                      }}
                    >
                      Adjust
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      render={
                        <Link href={`/preschool/stock/items/${row.itemId}`} />
                      }
                    >
                      Ledger
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableCard>
  );
}
