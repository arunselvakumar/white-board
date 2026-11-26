"use client";

import { ReceiptIcon } from "@phosphor-icons/react/ssr";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { MoreHorizontal, Plus, Wand2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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
import { cn } from "@repo/ui/lib/utils";

import { RoleGate } from "@/app/(app)/preschool/_components/active-centre-provider";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import { FormAlert } from "@/components/auth/form-alert";
import { formatPaiseAsRupees } from "@/lib/money";
import {
  childFullName,
  FEE_PAYMENT_METHOD_LABEL,
  feeDateLabel,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_VARIANT,
} from "@/lib/preschool-fees";
import { QueryHttpError } from "@/src/queries/http";
import {
  childFeeAccountQueryOptions,
  feeKeys,
  generateInvoices,
  type PreschoolChildFeeAccount,
} from "@/src/queries/preschool/fees";

import {
  CollectPaymentDialog,
  type CollectPaymentTarget,
} from "../../../_components/collect-payment-dialog";
import { InvoiceDialogs, type InvoiceDialog } from "./invoice-dialogs";

function Total({
  label,
  paise,
  tone,
}: {
  label: string;
  paise: number;
  tone?: "danger";
}) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "danger" && paise > 0 && "text-destructive",
        )}
      >
        {formatPaiseAsRupees(paise)}
      </dd>
    </div>
  );
}

function GenerateInvoices({ childId }: { childId: string }) {
  const queryClient = useQueryClient();
  const generate = useMutation({
    mutationFn: () => generateInvoices(childId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: feeKeys.all });
    },
  });
  return (
    <EmptyState
      className="border"
      size="md"
      icon={ReceiptIcon}
      tone="green"
      title="No Invoices yet"
      description="Raise this Child's Invoices from the Fee Structure for their Programme, or add one by hand."
      actions={
        <div className="flex flex-col items-center gap-2">
          <Button
            type="button"
            disabled={generate.isPending}
            onClick={() => {
              generate.mutate();
            }}
          >
            <Wand2 aria-hidden="true" />
            Generate Invoices from the Fee Structure
          </Button>
          <FormAlert
            message={
              generate.error == null
                ? undefined
                : generate.error instanceof QueryHttpError
                  ? generate.error.message
                  : "Could not raise the Invoices."
            }
          />
        </div>
      }
    />
  );
}

/** A Child's Invoices, Fee Payments and totals, with every fee action. */
export function ChildFeeAccount({
  account,
}: {
  account: PreschoolChildFeeAccount;
}) {
  const { child, invoices, payments, totals } = account;
  const name = childFullName(child);
  const [dialog, setDialog] = useState<InvoiceDialog | null>(null);
  const [collect, setCollect] = useState<CollectPaymentTarget | null>(null);
  const phones = [
    child.fatherPhone == null
      ? null
      : `${child.fatherName ?? "Father"} ${child.fatherPhone}`,
    child.motherPhone == null
      ? null
      : `${child.motherName ?? "Mother"} ${child.motherPhone}`,
  ].filter((value): value is string => value != null);
  return (
    <PreschoolPage
      title={name}
      meta={[child.admissionNumber, child.classroom?.name, ...phones]
        .filter((part) => part != null && part !== "")
        .join(" · ")}
      back={{ href: "/preschool/fees", label: "Fees" }}
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDialog({ kind: "add" });
            }}
          >
            <Plus aria-hidden="true" />
            Add Invoice
          </Button>
          <Button
            type="button"
            disabled={totals.duePaise === 0}
            onClick={() => {
              setCollect({
                childId: child.id,
                childName: name,
                duePaise: totals.duePaise,
                overduePaise: totals.overduePaise,
              });
            }}
          >
            Collect payment
          </Button>
        </>
      }
    >
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Total label="Billed" paise={totals.billedPaise} />
        <Total label="Concession" paise={totals.concessionPaise} />
        <Total label="Paid" paise={totals.paidPaise} />
        <Total label="Due" paise={totals.duePaise} />
        <Total label="Overdue" paise={totals.overduePaise} tone="danger" />
      </dl>

      <section aria-labelledby="invoices-heading" className="space-y-3">
        <h2 id="invoices-heading" className="text-lg font-semibold">
          Invoices
        </h2>
        {invoices.length === 0 ? (
          <GenerateInvoices childId={child.id} />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Concession</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => {
                  const cancelled = invoice.status === "cancelled";
                  return (
                    <TableRow
                      key={invoice.id}
                      className={cn(cancelled && "text-muted-foreground")}
                    >
                      <TableCell>
                        <div
                          className={cn(
                            "font-medium",
                            cancelled && "line-through",
                          )}
                        >
                          {invoice.label}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {invoice.feeHeadName}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {feeDateLabel(invoice.dueOn)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPaiseAsRupees(invoice.amountPaise)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {invoice.concessionPaise === 0 ? (
                          "—"
                        ) : (
                          <>
                            {formatPaiseAsRupees(invoice.concessionPaise)}
                            <div className="text-muted-foreground text-xs">
                              {invoice.concessionReason}
                            </div>
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPaiseAsRupees(invoice.paidPaise)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatPaiseAsRupees(invoice.duePaise)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={INVOICE_STATUS_VARIANT[invoice.status]}>
                          {INVOICE_STATUS_LABEL[invoice.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            disabled={cancelled}
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Actions for ${invoice.label}`}
                              />
                            }
                          >
                            <MoreHorizontal aria-hidden="true" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setDialog({ kind: "edit", invoice });
                              }}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setDialog({ kind: "concession", invoice });
                              }}
                            >
                              Concession
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={invoice.paidPaise > 0}
                              onClick={() => {
                                setDialog({ kind: "cancel", invoice });
                              }}
                            >
                              Cancel Invoice
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>

      <section aria-labelledby="payments-heading" className="space-y-3">
        <h2 id="payments-heading" className="text-lg font-semibold">
          Fee Payments
        </h2>
        {payments.length === 0 ? (
          <p className="text-muted-foreground text-sm">No Fee Payments yet.</p>
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow
                    key={payment.id}
                    className={cn(payment.cancelled && "text-muted-foreground")}
                  >
                    <TableCell>
                      <Link
                        href={`/preschool/fees/receipts/${payment.id}`}
                        className="font-medium tabular-nums hover:underline"
                      >
                        {payment.receiptNumber}
                      </Link>
                      {payment.cancelled ? (
                        <Badge variant="destructive" className="ml-2">
                          Cancelled
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {feeDateLabel(payment.receivedOn)}
                    </TableCell>
                    <TableCell>
                      {FEE_PAYMENT_METHOD_LABEL[payment.method]}
                      {payment.reference == null
                        ? null
                        : ` · ${payment.reference}`}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        payment.cancelled && "line-through",
                      )}
                    >
                      {formatPaiseAsRupees(payment.amountPaise)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>

      <InvoiceDialogs
        childId={child.id}
        dialog={dialog}
        onClose={() => {
          setDialog(null);
        }}
      />
      <CollectPaymentDialog
        target={collect}
        onOpenChange={(open) => {
          if (!open) setCollect(null);
        }}
      />
    </PreschoolPage>
  );
}

function AccountLoader({ childId }: { childId: string }) {
  const { data } = useSuspenseQuery(childFeeAccountQueryOptions(childId));
  return <ChildFeeAccount account={data} />;
}

export function ChildFeeAccountScreen({ childId }: { childId: string }) {
  return (
    <RoleGate roles={["owner", "centre_head"]}>
      <AccountLoader childId={childId} />
    </RoleGate>
  );
}
