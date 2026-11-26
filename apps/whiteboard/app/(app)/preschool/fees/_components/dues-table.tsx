"use client";

import { CheckCircleIcon } from "@phosphor-icons/react/ssr";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { TableCard } from "@/app/(app)/_components/table-card";

import { formatPaiseAsRupees } from "@/lib/money";
import {
  childFullName,
  feeDateLabel,
  parentContact,
} from "@/lib/preschool-fees";
import type { DuesRowView } from "@/src/preschool/application/fee-views";
import { whatsappReminderUrl } from "@/src/queries/preschool/fees";

import type { CollectPaymentTarget } from "./collect-payment-dialog";

function ReminderLink({
  row,
  centreName,
}: {
  row: DuesRowView;
  centreName: string;
}) {
  const contact = parentContact(row);
  const name = childFullName(row);
  const url =
    contact == null
      ? null
      : whatsappReminderUrl({
          phone: contact.phone,
          childName: name,
          dueText: formatPaiseAsRupees(
            row.overduePaise > 0 ? row.overduePaise : row.duePaise,
          ),
          centreName,
        });
  if (url == null) {
    const hintId = `no-mobile-${row.childId}`;
    return (
      <span className="inline-flex flex-col items-start">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled
          aria-describedby={hintId}
        >
          <MessageCircle aria-hidden="true" />
          Remind on WhatsApp
        </Button>
        <span id={hintId} className="text-muted-foreground text-xs">
          No mobile number
        </span>
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Remind ${name}'s family on WhatsApp`}
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      <MessageCircle aria-hidden="true" />
      Remind on WhatsApp
    </a>
  );
}

/** Children who owe, with Collect and a WhatsApp reminder on each row. */
export function DuesTable({
  rows,
  centreName,
  onCollect,
}: {
  rows: readonly DuesRowView[];
  centreName: string;
  onCollect: (target: CollectPaymentTarget) => void;
}) {
  if (rows.length === 0)
    return (
      <EmptyState
        className="border"
        size="md"
        icon={CheckCircleIcon}
        tone="green"
        title="Nobody owes anything"
        description="Every Invoice here is paid. New dues show up as they fall due."
      />
    );
  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Child</TableHead>
            <TableHead>Classroom</TableHead>
            <TableHead>Parent</TableHead>
            <TableHead className="text-right">Due</TableHead>
            <TableHead className="text-right">Overdue</TableHead>
            <TableHead>Oldest due</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const name = childFullName(row);
            const contact = parentContact(row);
            return (
              <TableRow key={row.childId}>
                <TableCell>
                  <Link
                    href={`/preschool/fees/children/${row.childId}`}
                    className="font-medium hover:underline"
                  >
                    {name}
                  </Link>
                  <div className="text-muted-foreground text-xs">
                    {row.admissionNumber}
                  </div>
                </TableCell>
                <TableCell>{row.classroom?.name ?? "—"}</TableCell>
                <TableCell>
                  {contact == null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <>
                      <div>{contact.name ?? "Parent"}</div>
                      <div className="text-muted-foreground text-xs tabular-nums">
                        {contact.phone}
                      </div>
                    </>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPaiseAsRupees(row.duePaise)}
                </TableCell>
                <TableCell
                  className={
                    row.overduePaise > 0
                      ? "text-destructive text-right font-medium tabular-nums"
                      : "text-muted-foreground text-right tabular-nums"
                  }
                >
                  {formatPaiseAsRupees(row.overduePaise)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {feeDateLabel(row.oldestDueOn)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-start justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      aria-label={`Collect from ${name}`}
                      onClick={() => {
                        onCollect({
                          childId: row.childId,
                          childName: name,
                          duePaise: row.duePaise,
                          overduePaise: row.overduePaise,
                        });
                      }}
                    >
                      Collect
                    </Button>
                    <ReminderLink row={row} centreName={centreName} />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableCard>
  );
}
