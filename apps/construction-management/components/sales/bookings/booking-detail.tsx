"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  CalendarClock,
  Pencil,
  Trash2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

import { FormAlert } from "@/components/auth/form-alert";
import { formatDate, localToday } from "@/components/payments/payment-format";
import {
  areaLabel,
  BookingStatusBadge,
} from "@/components/sales/units/sales-status";
import { SiteRecordHeader } from "@/components/site-work/site-record-header";
import { formatDateTime } from "@/components/tracking/issues/issue-parts";
import { QueryHttpError } from "@/src/queries/http";
import {
  bookingQuery,
  bookingsPath,
  useDeleteBooking,
  type BookingDetail as Booking,
} from "@/src/queries/sales-bookings";

import { BookingActionDialog, type BookingDialogKind } from "./booking-dialogs";
import { BookingFiles } from "./booking-files";

function Fact({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words whitespace-pre-line">{children}</dd>
    </div>
  );
}

/** One history row in words. */
export function bookingHistoryLine(item: Booking["history"][number]): string {
  switch (item.kind) {
    case "created":
      return item.status === "booked"
        ? `Booked on ${formatDate(item.onDate)}`
        : `Put on hold on ${formatDate(item.onDate)}${item.holdUntil == null ? "" : ` until ${formatDate(item.holdUntil)}`}`;
    case "hold_extended":
      return item.holdUntil == null
        ? "Hold extended"
        : `Hold extended until ${formatDate(item.holdUntil)}`;
    case "confirmed":
      return `Confirmed as Booked on ${formatDate(item.onDate)}`;
    case "cancelled":
      return `Cancelled on ${formatDate(item.onDate)}${item.reason == null ? "" : `: ${item.reason}`}`;
  }
}

/**
 * One booking (CM-1006, ADR CM-0022 §7): the unit and its Wing, status
 * (Hold expired after Hold until), dates, the customer, Referred By,
 * remarks, the inquiry it came from, the Booking Form and photos, and its
 * history of statuses. Actions by the viewer's flags: Confirm and Extend
 * hold (On Hold), Cancel and Edit (On Hold or Booked), Delete.
 */
export function BookingDetail({
  projectId,
  id,
  today = localToday(),
}: {
  projectId: string;
  id: string;
  today?: string;
}) {
  const router = useRouter();
  const { data: booking } = useSuspenseQuery(bookingQuery(id));
  const remove = useDeleteBooking(booking);
  const [dialog, setDialog] = useState<BookingDialogKind | "delete" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const listHref = bookingsPath(projectId);
  const title = `${booking.wing.name} · ${booking.unit.name}`;
  const area = areaLabel(booking.carpetArea, booking.areaUnit);

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <SiteRecordHeader
        back={{ label: "Bookings", href: listHref }}
        size="detail"
        title={title}
        meta={`${booking.customerName} · ${formatDate(booking.bookingDate)}`}
        actions={
          <>
            <BookingStatusBadge status={booking.status} />
            {booking.actions.confirm && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setDialog("confirm");
                }}
              >
                <BadgeCheck aria-hidden="true" />
                Confirm
              </Button>
            )}
            {booking.actions.extendHold && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setDialog("extend-hold");
                }}
              >
                <CalendarClock aria-hidden="true" />
                Extend hold
              </Button>
            )}
            {booking.actions.edit && (
              <Link
                href={`${bookingsPath(projectId, booking.id)}/edit`}
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            )}
            {booking.actions.cancel && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setDialog("cancel");
                }}
              >
                <XCircle aria-hidden="true" />
                Cancel booking
              </Button>
            )}
            {booking.actions.delete && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => {
                  setDialog("delete");
                }}
              >
                <Trash2 aria-hidden="true" />
                Delete
              </Button>
            )}
          </>
        }
      />

      <FormAlert message={error ?? undefined} />

      <div className="w-full max-w-4xl min-w-0 space-y-6">
        {booking.inquiry != null && (
          <p className="bg-muted/50 rounded-lg border px-3 py-2 text-sm">
            Converted from the inquiry of{" "}
            <Link
              href={`/app/projects/${encodeURIComponent(projectId)}/inquiries/${encodeURIComponent(booking.inquiry.id)}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {booking.inquiry.name === ""
                ? "a customer"
                : booking.inquiry.name}
            </Link>
          </p>
        )}
        <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
          <Fact label="Unit">
            {booking.unit.name} · {booking.unit.floorName}
          </Fact>
          <Fact label="Unit type">{booking.unitType ?? "—"}</Fact>
          <Fact label="Carpet area">{area ?? "—"}</Fact>
          <Fact label="Booking Date">{formatDate(booking.bookingDate)}</Fact>
          {booking.holdUntil != null && (
            <Fact label="Hold until">{formatDate(booking.holdUntil)}</Fact>
          )}
          {booking.confirmedOn != null && (
            <Fact label="Booked on">{formatDate(booking.confirmedOn)}</Fact>
          )}
          {booking.cancelledOn != null && (
            <Fact label="Cancelled on">
              {formatDate(booking.cancelledOn)}
              {booking.cancelReason == null ? "" : ` · ${booking.cancelReason}`}
            </Fact>
          )}
          <Fact label="Customer">{booking.customerName}</Fact>
          <Fact label="Mobile">{booking.customerMobile ?? "—"}</Fact>
          <Fact label="Email">{booking.customerEmail ?? "—"}</Fact>
          <Fact label="Address" className="sm:col-span-3">
            {booking.customerAddress ?? "—"}
          </Fact>
          <Fact label="Referred By">
            {[booking.referredByName, booking.referredByContact]
              .filter((part) => part != null)
              .join(" · ") || "—"}
          </Fact>
          <Fact label="Created By">
            {booking.createdBy.name ?? "A former member"} ·{" "}
            {formatDateTime(booking.createdAt)}
          </Fact>
          <Fact label="Remarks" className="sm:col-span-3">
            {booking.remarks ?? "—"}
          </Fact>
        </dl>

        <BookingFiles bookingId={booking.id} />

        <section
          aria-labelledby="booking-history"
          className="min-w-0 space-y-3"
        >
          <h3 id="booking-history" className="text-sm font-semibold">
            History
          </h3>
          <ol aria-label="History" className="space-y-2 border-l pl-4">
            {booking.history.map((item) => (
              <li key={item.id} className="text-sm">
                <p className="break-words">{bookingHistoryLine(item)}</p>
                <p className="text-muted-foreground text-xs">
                  {item.by.name ?? "A former member"} ·{" "}
                  {formatDateTime(item.at)}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <BookingActionDialog
        booking={booking}
        kind={dialog === "delete" ? null : dialog}
        today={today}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      />
      <AlertDialog
        open={dialog === "delete"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              Only for a booking entered by mistake: it leaves the list and the
              unit is free again. To keep its history, cancel it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                setError(null);
                remove.mutate(undefined, {
                  onSuccess: () => {
                    router.push(listHref);
                  },
                  onError: (caught) => {
                    setDialog(null);
                    setError(
                      caught instanceof QueryHttpError
                        ? caught.message
                        : "Something went wrong. Please try again.",
                    );
                  },
                });
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
