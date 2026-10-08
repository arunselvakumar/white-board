"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { CalendarClock, FileText } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { buttonVariants } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@repo/ui/components/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { PageHeader } from "@/components/app-shell/page-header";
import {
  invoicesQuery,
  subscriptionQuery,
  type SubscriptionView,
} from "@/src/queries/subscription";
import { formatMinor } from "@/src/shared-kernel/money";

import {
  daysLeftText,
  GRANT_LABELS,
  KIND_LABELS,
  longDate,
  STATUS_LABELS,
} from "./subscription-text";

const checkoutHref = (kind: string) =>
  `/app/subscription/checkout?kind=${kind}`;

function OwnerActions({ view }: { view: SubscriptionView }) {
  if (!view.canManage) return null;
  if (view.status !== "active")
    return (
      <Link href={checkoutHref("new")} className={buttonVariants()}>
        Choose a plan
      </Link>
    );
  return (
    <>
      <Link
        href={checkoutHref("extend")}
        className={buttonVariants({ variant: "outline" })}
      >
        Extend
      </Link>
      <Link
        href={checkoutHref("add_ons")}
        className={buttonVariants({ variant: "outline" })}
      >
        Add-ons
      </Link>
      <Link href={checkoutHref("upgrade")} className={buttonVariants()}>
        Choose plan
      </Link>
    </>
  );
}

function UsageBars({ view }: { view: SubscriptionView }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage</CardTitle>
        <CardDescription>
          Your plan plus add-ons. Archived records do not count.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        {view.usage.map((bar) => {
          const percent =
            bar.limit === 0 ? 100 : Math.min(100, (bar.used / bar.limit) * 100);
          return (
            <Progress
              key={bar.grant}
              value={percent}
              getAriaValueText={() =>
                `${String(bar.used)} of ${String(bar.limit)}`
              }
              className={
                bar.used >= bar.limit
                  ? "[&_[data-slot=progress-indicator]]:bg-destructive"
                  : undefined
              }
            >
              <ProgressLabel>{GRANT_LABELS[bar.grant]}</ProgressLabel>
              <ProgressValue className="ml-auto">
                {() => `${String(bar.used)} of ${String(bar.limit)}`}
              </ProgressValue>
            </Progress>
          );
        })}
      </CardContent>
    </Card>
  );
}

function Invoices() {
  const { data } = useSuspenseQuery(invoicesQuery);
  return (
    <section aria-labelledby="invoices-heading" className="space-y-3">
      <h2 id="invoices-heading" className="text-lg font-semibold">
        Invoices
      </h2>
      {data.items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No invoices yet</EmptyTitle>
            <EmptyDescription>
              A tax invoice appears here after each payment.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>For</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>
                <span className="sr-only">Download</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-medium">
                  {invoice.invoiceNumber}
                </TableCell>
                <TableCell>
                  {longDate.format(new Date(invoice.paidAt))}
                </TableCell>
                <TableCell>
                  {KIND_LABELS[invoice.kind]} · {invoice.planName}
                  {invoice.months == null
                    ? ""
                    : `, ${String(invoice.months)} months`}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMinor(invoice.totalPaise, invoice.currency)}
                </TableCell>
                <TableCell className="text-right">
                  <a
                    href={invoice.pdfPath}
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                    aria-label={`Download invoice ${invoice.invoiceNumber}`}
                  >
                    <FileText aria-hidden="true" />
                    PDF
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

/** "Your Subscription" (CM-116): plan, expiry, usage bars, Owner actions. */
export function SubscriptionOverview() {
  const { data: view } = useSuspenseQuery(subscriptionQuery);
  const ends = longDate.format(new Date(view.endsAt));

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          title="Your Subscription"
          meta={`${view.planName} plan`}
          actions={<OwnerActions view={view} />}
        />

        {view.status === "expired" ? (
          <Alert variant="destructive">
            <CalendarClock aria-hidden="true" />
            <AlertTitle>Your plan has ended</AlertTitle>
            <AlertDescription>
              Your data is safe and read-only; export is still available.
              {view.canManage
                ? " Choose a plan to continue adding and editing."
                : " Ask the Owner to choose a plan."}
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {view.planName}
              <Badge
                variant={
                  view.status === "expired"
                    ? "destructive"
                    : view.status === "trial"
                      ? "secondary"
                      : "default"
                }
              >
                {STATUS_LABELS[view.status]}
              </Badge>
            </CardTitle>
            <CardDescription>
              {view.status === "expired"
                ? `Ended on ${ends}`
                : `${view.status === "trial" ? "Trial ends" : "Ends"} on ${ends} · ${daysLeftText(view.daysLeft)}`}
            </CardDescription>
          </CardHeader>
          {view.addOns.length > 0 || !view.canManage ? (
            <CardContent className="space-y-2 text-sm">
              {view.addOns.length > 0 ? (
                <p>
                  Add-ons:{" "}
                  {view.addOns
                    .map((addOn) => `${addOn.name} × ${String(addOn.quantity)}`)
                    .join(", ")}
                </p>
              ) : null}
              {view.canManage ? null : (
                <p className="text-muted-foreground">
                  Only the Owner can buy or change the plan.
                </p>
              )}
            </CardContent>
          ) : null}
        </Card>

        <UsageBars view={view} />

        {view.canManage ? <Invoices /> : null}
      </div>
    </div>
  );
}
