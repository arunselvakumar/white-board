"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { SiteRecordHeader } from "@/components/site-work/site-record-header";
import { bookingQuery, bookingsPath } from "@/src/queries/sales-bookings";

import { BookingForm } from "./booking-form";

/** Hold or Book a unit (CM-1006). */
export function BookingNew({
  projectId,
  unitId,
  status,
}: {
  projectId: string;
  unitId: string | null;
  status: "on_hold" | "booked";
}) {
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="w-full max-w-4xl">
        <SiteRecordHeader
          back={{ label: "Bookings", href: bookingsPath(projectId) }}
          title="New booking"
        />
      </div>
      <BookingForm projectId={projectId} unitId={unitId} status={status} />
    </div>
  );
}

/** Edit an On Hold or Booked booking (CM-1006). */
export function BookingEdit({
  projectId,
  bookingId,
}: {
  projectId: string;
  bookingId: string;
}) {
  const { data } = useSuspenseQuery(bookingQuery(bookingId));
  const title = `${data.wing.name} · ${data.unit.name}`;
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="w-full max-w-4xl">
        <SiteRecordHeader
          back={{ label: title, href: bookingsPath(projectId, bookingId) }}
          title={`Edit booking · ${title}`}
        />
      </div>
      {data.actions.edit ? (
        <BookingForm projectId={projectId} booking={data} />
      ) : (
        <p className="text-muted-foreground max-w-4xl text-sm">
          A cancelled booking cannot be edited.
        </p>
      )}
    </div>
  );
}
