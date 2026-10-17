"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { CircleCheck, Pencil, Ban, Lock, BadgeCheck } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";

import { FormAlert } from "@/components/auth/form-alert";
import { formatDate } from "@/components/payments/payment-format";
import { QueryHttpError } from "@/src/queries/http";
import { bookingsPath } from "@/src/queries/sales-bookings";
import { salesUnitQuery, useUnitCommand } from "@/src/queries/sales-units";
import { UNAVAILABLE_REASON_LABELS } from "@/src/sales/domain/sales-terms";

import { areaLabel, BookingStatusBadge, UnitStatusBadge } from "./sales-status";
import { UnitDetailsDialog, UnitUnavailableDialog } from "./unit-dialogs";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words whitespace-pre-line">{children}</dd>
    </div>
  );
}

/** Where Hold and Book open the booking form, with the unit chosen. */
export function newBookingHref(
  projectId: string,
  unitId: string,
  status: "on_hold" | "booked",
): string {
  const params = new URLSearchParams({ unitId, status });
  return `${bookingsPath(projectId)}/new?${params}`;
}

/**
 * One unit's sales details (CM-1005, CM-1006): its status, Unit type and
 * areas, why it is unavailable, its active booking and the bookings it
 * had, with the actions the member holds — Hold and Book (Create, while
 * Available), Unit details, Mark unavailable and Make available (Update).
 */
export function UnitPanel({
  projectId,
  unitId,
}: {
  projectId: string;
  unitId: string;
}) {
  const { data: unit } = useSuspenseQuery(salesUnitQuery(projectId, unitId));
  const command = useUnitCommand(projectId, unit);
  const [dialog, setDialog] = useState<"details" | "unavailable" | null>(null);
  const [error, setError] = useState<string | undefined>();
  const profile = unit.profile;
  const areas = [
    ["Carpet area", profile.carpetArea],
    ["Built-up area", profile.builtUpArea],
    ["Super built-up area", profile.superBuiltUpArea],
  ] as const;
  const past = unit.bookings.filter((item) => item.id !== unit.booking?.id);

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <UnitStatusBadge status={unit.status} />
        <span className="text-muted-foreground text-sm">
          {unit.wing.name} · {unit.floor.name}
        </span>
      </div>
      <FormAlert message={error} />
      {(unit.actions.book ||
        unit.actions.editDetails ||
        unit.actions.markUnavailable ||
        unit.actions.markAvailable) && (
        <div className="flex flex-wrap gap-2">
          {unit.actions.book && (
            <>
              <Link
                href={newBookingHref(projectId, unit.id, "on_hold")}
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                <Lock aria-hidden="true" />
                Hold
              </Link>
              <Link
                href={newBookingHref(projectId, unit.id, "booked")}
                className={buttonVariants({ size: "sm" })}
              >
                <BadgeCheck aria-hidden="true" />
                Book
              </Link>
            </>
          )}
          {unit.actions.editDetails && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setDialog("details");
              }}
            >
              <Pencil aria-hidden="true" />
              Unit details
            </Button>
          )}
          {unit.actions.markUnavailable && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDialog("unavailable");
              }}
            >
              <Ban aria-hidden="true" />
              Mark unavailable
            </Button>
          )}
          {unit.actions.markAvailable && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={command.isPending}
              onClick={() => {
                setError(undefined);
                command.mutate(
                  { action: "available" },
                  {
                    onError: (caught) => {
                      setError(
                        caught instanceof QueryHttpError
                          ? caught.message
                          : "Something went wrong. Please try again.",
                      );
                    },
                  },
                );
              }}
            >
              <CircleCheck aria-hidden="true" />
              Make available
            </Button>
          )}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-4 rounded-lg border p-4">
        <Fact label="Unit type">{profile.unitType ?? "—"}</Fact>
        {areas.map(([label, value]) => (
          <Fact key={label} label={label}>
            {areaLabel(value, profile.areaUnit) ?? "—"}
          </Fact>
        ))}
        {profile.unavailable && (
          <Fact label="Why unavailable">
            {profile.unavailableReason == null
              ? "—"
              : UNAVAILABLE_REASON_LABELS[profile.unavailableReason]}
            {profile.unavailableNote == null
              ? ""
              : ` · ${profile.unavailableNote}`}
          </Fact>
        )}
      </dl>

      {unit.booking != null && (
        <section
          aria-label="Booking"
          className="space-y-2 rounded-lg border p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {unit.booking.customerName}
            </h3>
            <BookingStatusBadge status={unit.booking.status} />
          </div>
          <p className="text-muted-foreground text-sm">
            Booking Date {formatDate(unit.booking.bookingDate)}
            {unit.booking.holdUntil == null
              ? ""
              : ` · Hold until ${formatDate(unit.booking.holdUntil)}`}
            {unit.booking.customerMobile == null
              ? ""
              : ` · ${unit.booking.customerMobile}`}
          </p>
          {unit.booking.status === "hold_expired" && (
            <p className="text-sm">
              The hold has expired: booking the unit again cancels it.
            </p>
          )}
          <Link
            href={bookingsPath(projectId, unit.booking.id)}
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            Open booking
          </Link>
        </section>
      )}

      {past.length > 0 && (
        <section aria-labelledby="unit-past-bookings" className="space-y-2">
          <h3 id="unit-past-bookings" className="text-sm font-semibold">
            Earlier bookings
          </h3>
          <ul className="divide-y rounded-lg border text-sm">
            {past.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <Link
                  href={bookingsPath(projectId, item.id)}
                  className="min-w-0 truncate font-medium hover:underline"
                >
                  {item.customerName}
                </Link>
                <span className="text-muted-foreground text-xs">
                  {formatDate(item.bookingDate)}
                </span>
                <BookingStatusBadge status={item.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {unit.actions.editDetails && (
        <UnitDetailsDialog
          projectId={projectId}
          unit={unit}
          open={dialog === "details"}
          onOpenChange={(open) => {
            setDialog(open ? "details" : null);
          }}
        />
      )}
      {unit.actions.markUnavailable && (
        <UnitUnavailableDialog
          projectId={projectId}
          unit={unit}
          open={dialog === "unavailable"}
          onOpenChange={(open) => {
            setDialog(open ? "unavailable" : null);
          }}
        />
      )}
    </div>
  );
}
