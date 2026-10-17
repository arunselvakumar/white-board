"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlarmClock,
  Ban,
  BadgeCheck,
  Building2,
  CircleCheck,
  CircleX,
  Inbox,
  Lock,
  Percent,
  UserRoundSearch,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { formatDate } from "@/components/payments/payment-format";
import {
  BookingStatusBadge,
  UNIT_STATUS_DOTS,
} from "@/components/sales/units/sales-status";
import type { Duration } from "@/lib/dashboard-duration";
import { bookingsPath } from "@/src/queries/sales-bookings";
import {
  bookingDashboardQuery,
  inquiryDashboardQuery,
  type BookingDashboardSection,
  type InquiryDashboardSection,
} from "@/src/queries/sales-dashboard";
import {
  CALL_ACTIVITY_PERIOD_LABELS,
  CALL_ACTIVITY_PERIODS,
  type CallActivityPeriod,
} from "@/src/sales/application/sales-dashboard";
import { bookingsModulePath } from "@/src/queries/sales-units";
import {
  FOLLOW_UP_ACTIVITY_LABELS,
  UNIT_SALES_STATUS_LABELS,
  UNIT_SALES_STATUSES,
} from "@/src/sales/domain/sales-terms";

import { Fact, Section, SectionSkeleton, denied } from "./dashboard-parts";
import { CountBars, Legend, StackedBar } from "./tracking-charts";

/** "1 inquiry", "3 inquiries". */
function count(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

const ICONS = {
  available: CircleCheck,
  on_hold: Lock,
  booked: BadgeCheck,
  unavailable: Ban,
} as const;

/** The Booking section's body once loaded: a snapshot as on today. */
export function BookingSectionBody({
  projectId,
  booking,
}: {
  projectId: string;
  booking: BookingDashboardSection;
}) {
  if (booking.counts.total === 0)
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Building2 aria-hidden="true" className="size-4" />
        No units yet: add Wings with their floors and units.
      </p>
    );
  const max = Math.max(1, ...booking.wings.map((wing) => wing.counts.total));
  return (
    <div className="min-w-0 space-y-5">
      <dl
        aria-label="Units by sales status"
        className="grid grid-cols-2 gap-2 lg:grid-cols-4"
      >
        {UNIT_SALES_STATUSES.map((status) => (
          <Fact
            key={status}
            label={UNIT_SALES_STATUS_LABELS[status]}
            icon={ICONS[status]}
          >
            {booking.counts[status]}
          </Fact>
        ))}
      </dl>
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <div className="min-w-0 space-y-3">
          <h3 className="text-sm font-medium">By Wing</h3>
          <Legend
            items={UNIT_SALES_STATUSES.map((status) => ({
              key: status,
              label: UNIT_SALES_STATUS_LABELS[status],
              swatch: UNIT_STATUS_DOTS[status],
            }))}
          />
          <ul aria-label="Units by Wing" className="space-y-3">
            {booking.wings.map((wing) => (
              <li key={wing.id} className="min-w-0 space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{wing.name}</span>
                  <span className="tabular-nums">{wing.counts.total}</span>
                </div>
                <StackedBar
                  max={max}
                  segments={UNIT_SALES_STATUSES.map((status) => ({
                    key: status,
                    label: UNIT_SALES_STATUS_LABELS[status],
                    count: wing.counts[status],
                    swatch: UNIT_STATUS_DOTS[status],
                  }))}
                />
                <p className="text-muted-foreground text-xs">
                  {UNIT_SALES_STATUSES.filter(
                    (status) => wing.counts[status] > 0,
                  )
                    .map(
                      (status) =>
                        `${UNIT_SALES_STATUS_LABELS[status]} ${String(wing.counts[status])}`,
                    )
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0 space-y-3">
          <h3 className="text-sm font-medium">Latest bookings</h3>
          {booking.latest.length === 0 ? (
            <p className="text-muted-foreground text-sm">No bookings yet.</p>
          ) : (
            <ul
              aria-label="Latest bookings"
              className="divide-y rounded-lg border"
            >
              {booking.latest.map((item) => (
                <li
                  key={item.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <Link
                      href={bookingsPath(projectId, item.id)}
                      className="font-medium hover:underline"
                    >
                      {item.wingName} · {item.unitName}
                    </Link>
                    <p className="text-muted-foreground truncate text-xs">
                      {item.customerName} · {formatDate(item.bookingDate)}
                    </p>
                  </div>
                  <BookingStatusBadge status={item.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Booking (CM-1008, ADR CM-0022 §11): the Project's units by sales status
 * — Available, On Hold, Booked, Unavailable — for the Project and per
 * Wing, and the five latest bookings. A snapshot as on today: the
 * dashboard duration does not change it. Needs Booking Read.
 */
export function BookingSection({ projectId }: { projectId: string }) {
  const { data, isPending, error } = useQuery(bookingDashboardQuery(projectId));
  return (
    <Section
      id="dashboard-booking"
      title="Booking"
      aside={
        <Link
          href={bookingsModulePath(projectId, "units")}
          className="text-primary text-sm font-medium underline-offset-4 hover:underline"
        >
          Units
        </Link>
      }
    >
      <p className="text-muted-foreground -mt-2 text-xs">
        As on today; the duration above does not apply.
      </p>
      {isPending ? (
        <SectionSkeleton />
      ) : error != null ? (
        <p className="text-muted-foreground text-sm">
          {denied(error)
            ? "Bookings need the Dashboard permission on this Project."
            : "Bookings could not be loaded."}
        </p>
      ) : data.booking == null ? (
        <p className="text-muted-foreground text-sm">
          Bookings need the Booking permission on this Project.
        </p>
      ) : (
        <BookingSectionBody projectId={projectId} booking={data.booking} />
      )}
    </Section>
  );
}

function rateText(rate: number | null): string {
  return rate == null ? "—" : `${rate.toFixed(1)}%`;
}

/** The Inquiry section's body once loaded. */
export function InquirySectionBody({
  inquiry,
  period,
  onPeriod,
}: {
  inquiry: InquiryDashboardSection;
  period: CallActivityPeriod;
  onPeriod: (period: CallActivityPeriod) => void;
}) {
  return (
    <div className="min-w-0 space-y-6">
      <dl
        aria-label="Inquiry figures"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
      >
        <Fact label="Total" icon={Inbox}>
          {inquiry.total}
        </Fact>
        <Fact label="Open" icon={UserRoundSearch}>
          {inquiry.open}
        </Fact>
        <Fact label="Converted" icon={CircleCheck}>
          {inquiry.converted}
        </Fact>
        <Fact label="Lost" icon={CircleX}>
          {inquiry.lost}
        </Fact>
        <Fact label="Conv. Rate" icon={Percent}>
          {rateText(inquiry.conversionRate)}
        </Fact>
        <Fact label="Overdue" icon={AlarmClock}>
          {inquiry.overdue}
        </Fact>
      </dl>
      <p className="text-muted-foreground -mt-3 text-xs">
        Total, Converted, Lost and Conv. Rate are by Inquiry Date in the
        duration; Open and Overdue are as of now.
      </p>
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <CountBars
          title="Funnel"
          empty="No open inquiries."
          items={inquiry.funnel.map((stage) => ({
            key: stage.stageId,
            label: stage.name,
            count: stage.count,
          }))}
        />
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Call Activity</h3>
            <ToggleGroup
              aria-label="Call Activity period"
              variant="outline"
              size="sm"
              className="flex-wrap"
              value={[period]}
              onValueChange={(value: string[]) => {
                const next = CALL_ACTIVITY_PERIODS.find(
                  (item) => item === value[0],
                );
                if (next != null) onPeriod(next);
              }}
            >
              {CALL_ACTIVITY_PERIODS.map((item) => (
                <ToggleGroupItem key={item} value={item}>
                  {CALL_ACTIVITY_PERIOD_LABELS[item]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <dl className="grid grid-cols-2 gap-2">
            <Fact label="Calls">{inquiry.callActivity.calls}</Fact>
            <Fact label="All activities">{inquiry.callActivity.all}</Fact>
          </dl>
          <ul
            aria-label="Follow-ups by activity"
            className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs"
          >
            {inquiry.callActivity.byActivity.map((item) => (
              <li key={item.activity}>
                {FOLLOW_UP_ACTIVITY_LABELS[item.activity]}{" "}
                <span className="text-foreground tabular-nums">
                  {item.count}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <h3 className="text-sm font-semibold">Lead source performance</h3>
          {inquiry.leadSources.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No inquiries in this duration.
            </p>
          ) : (
            <ul
              aria-label="Lead source performance"
              className="divide-y rounded-lg border text-sm"
            >
              {inquiry.leadSources.map((source) => (
                <li
                  key={source.leadSourceId ?? "none"}
                  className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2"
                >
                  <span className="min-w-0 truncate font-medium">
                    {source.name}
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {source.total} total · {source.converted} converted ·{" "}
                    {rateText(source.rate)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <h3 className="text-sm font-semibold">Sales team performance</h3>
          {inquiry.team.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No inquiries or follow-ups in this duration.
            </p>
          ) : (
            <ul
              aria-label="Sales team performance"
              className="divide-y rounded-lg border text-sm"
            >
              {inquiry.team.map((member) => (
                <li
                  key={member.memberId ?? "none"}
                  className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2"
                >
                  <span className="min-w-0 truncate font-medium">
                    {member.name}
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {count(member.inquiries, "inquiry", "inquiries")} ·{" "}
                    {count(member.followUps, "follow-up", "follow-ups")} ·{" "}
                    {count(member.conversions, "conversion", "conversions")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Inquiry (CM-1008, ADR CM-0022 §11): Total, Open, Converted, Lost, Conv.
 * Rate and Overdue; the funnel; lead source and sales team performance;
 * Call Activity with its own period. Needs Inquiry Read; without View all
 * it counts the viewer's own, assigned and Lead Owner inquiries.
 */
export function InquirySection({
  projectId,
  duration,
}: {
  projectId: string;
  duration: Duration;
}) {
  const [period, setPeriod] = useState<CallActivityPeriod>("today");
  const { data, isPending, error } = useQuery(
    inquiryDashboardQuery(projectId, duration, period),
  );
  return (
    <Section
      id="dashboard-inquiry"
      title="Inquiry"
      aside={
        <Link
          href={`/app/projects/${encodeURIComponent(projectId)}/inquiries`}
          className="text-primary text-sm font-medium underline-offset-4 hover:underline"
        >
          Inquiries
        </Link>
      }
    >
      {isPending ? (
        <SectionSkeleton />
      ) : error != null ? (
        <p className="text-muted-foreground text-sm">
          {denied(error)
            ? "Inquiries need the Dashboard permission on this Project."
            : "Inquiries could not be loaded."}
        </p>
      ) : data.inquiry == null ? (
        <p className="text-muted-foreground text-sm">
          Inquiries need the Inquiry permission on this Project.
        </p>
      ) : (
        <InquirySectionBody
          inquiry={data.inquiry}
          period={period}
          onPeriod={setPeriod}
        />
      )}
    </Section>
  );
}
