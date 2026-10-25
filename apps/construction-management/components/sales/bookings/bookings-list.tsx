"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { formatMobile } from "@repo/auth/construction/mobile";
import {
  Ban,
  CircleCheck,
  LayoutGrid,
  PauseCircle,
  Plus,
  Receipt,
  TimerOff,
} from "lucide-react";
import Link from "next/link";
import { Suspense, useState, useTransition } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { FilterTabs, type FilterTab } from "@repo/ui/components/filter-tabs";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { cn } from "@repo/ui/lib/utils";

import { formatDate } from "@/components/payments/payment-format";
import { FilterSelect } from "@/components/procurement/purchase-requests/filter-select";
import { BookingStatusBadge } from "@/components/sales/units/sales-status";
import { canInSales, salesAccessQuery } from "@/src/queries/sales-access";
import {
  bookingsPath,
  bookingsQuery,
  type Booking,
  type BookingFilters,
} from "@/src/queries/sales-bookings";
import { unitChartQuery } from "@/src/queries/sales-units";
import {
  BOOKING_DISPLAY_STATUS_LABELS,
  type BookingDisplayStatus,
} from "@/src/sales/domain/booking";
import { BOOKING_COLUMNS, BookingRowsSkeleton } from "./bookings-skeletons";

type Filters = {
  statuses: BookingDisplayStatus[];
  wingId: string;
  search: string;
};

const NO_FILTERS: Filters = { statuses: [], wingId: "", search: "" };

const STATUS_TABS: FilterTab<BookingDisplayStatus | "all">[] = [
  { value: "all", label: "All", icon: LayoutGrid },
  {
    value: "on_hold",
    label: BOOKING_DISPLAY_STATUS_LABELS.on_hold,
    icon: PauseCircle,
  },
  {
    value: "hold_expired",
    label: BOOKING_DISPLAY_STATUS_LABELS.hold_expired,
    icon: TimerOff,
  },
  {
    value: "booked",
    label: BOOKING_DISPLAY_STATUS_LABELS.booked,
    icon: CircleCheck,
  },
  {
    value: "cancelled",
    label: BOOKING_DISPLAY_STATUS_LABELS.cancelled,
    icon: Ban,
  },
];

function plural(n: number, word: string): string {
  return `${String(n)} ${n === 1 ? word : `${word}s`}`;
}

/**
 * Bookings → **Bookings** (CM-1006): the Project's bookings, newest
 * first, with status tabs (All, On Hold, Hold expired, Booked, Cancelled), a
 * Wing filter and a search on the customer or Referred By; cards at phone
 * width, a table above. Booking Create holders add one.
 */
export function BookingsList({ projectId }: { projectId: string }) {
  const access = useQuery(salesAccessQuery(projectId)).data;
  const canCreate =
    access != null && canInSales(access, "sales.bookings", "create");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<BookingFilters["cursor"]>(null);
  const [updating, startTransition] = useTransition();
  const change = (next: Partial<Filters>) => {
    startTransition(() => {
      setFilters((current) => ({ ...current, ...next }));
      setCursor(null);
    });
  };
  const wings = useQuery(unitChartQuery(projectId)).data?.wings ?? [];
  const newHref = `${bookingsPath(projectId)}/new`;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Bookings</h2>
        {canCreate && (
          <Link href={newHref} className={buttonVariants({ size: "sm" })}>
            <Plus aria-hidden="true" />
            New booking
          </Link>
        )}
      </div>
      <FilterTabs
        aria-label="Status"
        items={STATUS_TABS}
        value={filters.statuses[0] ?? "all"}
        onValueChange={(next) => {
          change({ statuses: next === "all" ? [] : [next] });
        }}
      />
      <div className="grid min-w-0 grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        {wings.length > 1 && (
          <FilterSelect
            id="bookings-wing"
            label="Wing"
            allLabel="Every Wing"
            value={filters.wingId}
            options={wings.map((wing) => ({
              value: wing.id,
              label: wing.name,
            }))}
            onChange={(wingId) => {
              change({ wingId });
            }}
          />
        )}
        <div className="col-span-2 min-w-0 space-y-1 sm:col-span-1">
          <Label htmlFor="bookings-search" className="text-xs">
            Search
          </Label>
          <Input
            id="bookings-search"
            type="search"
            placeholder="Customer, mobile or Referred By"
            className="h-8 w-full sm:w-64"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              change({ search: event.target.value });
            }}
          />
        </div>
      </div>
      <div
        className={cn("min-w-0", updating && "opacity-60 transition-opacity")}
      >
        <Suspense fallback={<BookingRowsSkeleton />}>
          <BookingRows
            projectId={projectId}
            filters={filters}
            cursor={cursor}
            newHref={canCreate ? newHref : null}
            onPage={(next) => {
              startTransition(() => {
                setCursor(next);
              });
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}

function BookingRows({
  projectId,
  filters,
  cursor,
  newHref,
  onPage,
}: {
  projectId: string;
  filters: Filters;
  cursor: BookingFilters["cursor"];
  newHref: string | null;
  onPage: (cursor: BookingFilters["cursor"]) => void;
}) {
  const { data } = useSuspenseQuery(
    bookingsQuery(projectId, { ...filters, cursor }),
  );
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const href = (booking: Booking) => bookingsPath(projectId, booking.id);
  const unit = (booking: Booking) =>
    `${booking.wing.name} · ${booking.unit.name}`;

  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Receipt />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? "No bookings match" : "No bookings yet"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try another status, Wing or search."
              : "Hold a unit for a customer or book it. Each unit has one booking at a time; a cancelled one stays in its history."}
          </EmptyDescription>
        </EmptyHeader>
        {!filtered && newHref != null && (
          <EmptyContent>
            <Link href={newHref} className={buttonVariants({ size: "sm" })}>
              New booking
            </Link>
          </EmptyContent>
        )}
      </Empty>
    );

  return (
    <div className="min-w-0 space-y-3">
      <p className="text-muted-foreground text-sm">
        {plural(data.total, "booking")}
      </p>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table aria-label="Bookings">
          <TableHeader>
            <TableRow>
              {BOOKING_COLUMNS.map((column, index) => (
                <TableHead key={index} className={column.className}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((booking) => (
              <TableRow key={booking.id}>
                <TableCell className="font-medium whitespace-nowrap">
                  <Link href={href(booking)} className="hover:underline">
                    {unit(booking)}
                  </Link>
                </TableCell>
                <TableCell className="max-w-56">
                  <div className="truncate">{booking.customerName}</div>
                  <div className="text-muted-foreground truncate text-xs">
                    {booking.customerMobile == null
                      ? ""
                      : formatMobile(booking.customerMobile)}
                  </div>
                </TableCell>
                <TableCell>{booking.unitType ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(booking.bookingDate)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {booking.holdUntil == null
                    ? "—"
                    : formatDate(booking.holdUntil)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {booking.referredByName ?? "—"}
                </TableCell>
                <TableCell>
                  <BookingStatusBadge status={booking.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label="Bookings" className="space-y-2 md:hidden">
        {data.items.map((booking) => (
          <li key={booking.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={href(booking)}
                className="font-medium hover:underline"
              >
                {unit(booking)}
              </Link>
              <BookingStatusBadge status={booking.status} />
            </div>
            <p className="mt-1 truncate text-sm">{booking.customerName}</p>
            <p className="text-muted-foreground text-xs">
              {formatDate(booking.bookingDate)}
              {booking.holdUntil == null
                ? ""
                : ` · Hold until ${formatDate(booking.holdUntil)}`}
              {booking.unitType == null ? "" : ` · ${booking.unitType}`}
            </p>
          </li>
        ))}
      </ul>
      {(data.prevCursor != null || data.nextCursor != null) && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.prevCursor == null}
            onClick={() => {
              if (data.prevCursor != null) onPage({ before: data.prevCursor });
            }}
          >
            Newer
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={data.nextCursor == null}
            onClick={() => {
              if (data.nextCursor != null) onPage({ after: data.nextCursor });
            }}
          >
            Older
          </Button>
        </div>
      )}
    </div>
  );
}
