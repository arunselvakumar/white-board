"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import Link from "next/link";
import { Suspense, useDeferredValue, useMemo, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Switch } from "@repo/ui/components/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";

import {
  RoleGate,
  useActiveCentre,
} from "@/app/(app)/preschool/_components/active-centre-provider";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import { monthStartOf } from "@/lib/preschool-fees";
import { todayInIndia } from "@/src/preschool/domain/dates";
import { classroomsQueryOptions } from "@/src/queries/preschool/classrooms";
import {
  duesQueryOptions,
  feePaymentsQueryOptions,
} from "@/src/queries/preschool/fees";

import {
  CollectPaymentDialog,
  type CollectPaymentTarget,
} from "./collect-payment-dialog";
import { DuesTable } from "./dues-table";
import { FeeSummaryTiles } from "./fee-summary-tiles";
import { PaymentsTable } from "./payments-table";

const PAGE_SIZE = 25;
const ALL_CLASSROOMS = "all";

function TableFallback() {
  return <Skeleton className="h-48 w-full rounded-xl" />;
}

function DuesPanel({
  centreId,
  centreName,
}: {
  centreId: string;
  centreName: string;
}) {
  const [classroomId, setClassroomId] = useState(ALL_CLASSROOMS);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [target, setTarget] = useState<CollectPaymentTarget | null>(null);
  const { data: classrooms } = useSuspenseQuery(
    classroomsQueryOptions(centreId),
  );
  const filters = useDeferredValue(
    useMemo(
      () => ({
        centreId,
        ...(classroomId === ALL_CLASSROOMS ? {} : { classroomId }),
        only: overdueOnly ? ("overdue" as const) : ("all" as const),
      }),
      [centreId, classroomId, overdueOnly],
    ),
  );
  const { data } = useSuspenseQuery(duesQueryOptions(filters));
  const classroomItems = [
    { value: ALL_CLASSROOMS, label: "All Classrooms" },
    ...classrooms.items.map((classroom) => ({
      value: classroom.id,
      label: classroom.name,
    })),
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="dues-classroom">Classroom</Label>
          <Select
            items={classroomItems}
            value={classroomId}
            onValueChange={(value) => {
              if (value != null) setClassroomId(value);
            }}
          >
            <SelectTrigger id="dues-classroom" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {classroomItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex h-8 items-center gap-2">
          <Switch
            id="dues-overdue-only"
            checked={overdueOnly}
            onCheckedChange={(checked) => {
              setOverdueOnly(checked);
            }}
          />
          <Label htmlFor="dues-overdue-only">Overdue only</Label>
        </div>
      </div>
      <DuesTable
        rows={data.items}
        centreName={centreName}
        onCollect={setTarget}
      />
      <CollectPaymentDialog
        target={target}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      />
    </div>
  );
}

function PaymentsPanel({ centreId }: { centreId: string }) {
  const today = todayInIndia(new Date());
  const [from, setFrom] = useState(monthStartOf(today));
  const [to, setTo] = useState(today);
  /** Cursors of the pages before this one; the last is this page's. */
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1);
  const filters = useDeferredValue(
    useMemo(
      () => ({
        centreId,
        ...(from === "" ? {} : { from }),
        ...(to === "" ? {} : { to }),
        limit: PAGE_SIZE,
        ...(cursor == null ? {} : { cursor }),
      }),
      [centreId, from, to, cursor],
    ),
  );
  const { data } = useSuspenseQuery(feePaymentsQueryOptions(filters));
  const page = cursors.length + 1;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="payments-from">From</Label>
          <Input
            id="payments-from"
            type="date"
            value={from}
            max={to === "" ? today : to}
            onChange={(event) => {
              setFrom(event.target.value);
              setCursors([]);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payments-to">To</Label>
          <Input
            id="payments-to"
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(event) => {
              setTo(event.target.value);
              setCursors([]);
            }}
          />
        </div>
      </div>
      <PaymentsTable page={data} />
      {data.total > PAGE_SIZE ? (
        <div className="flex items-center justify-end gap-2">
          <span className="text-muted-foreground text-sm">
            Page {page} of {Math.ceil(data.total / PAGE_SIZE)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={cursors.length === 0}
            onClick={() => {
              setCursors((previous) => previous.slice(0, -1));
            }}
          >
            <ChevronLeft aria-hidden="true" />
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={data.nextCursor == null}
            onClick={() => {
              const next = data.nextCursor;
              if (next != null) setCursors((previous) => [...previous, next]);
            }}
          >
            Next
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FeesDesk() {
  const { centre } = useActiveCentre();
  const [tab, setTab] = useState("dues");
  return (
    <PreschoolPage
      title="Fees"
      actions={
        <Button
          variant="outline"
          render={<Link href="/preschool/fees/structures" />}
        >
          <Settings2 aria-hidden="true" />
          Fee Structures
        </Button>
      }
    >
      <Suspense fallback={<Skeleton className="h-28 w-full rounded-xl" />}>
        <FeeSummaryTiles centreId={centre.id} />
      </Suspense>
      <Tabs
        value={tab}
        onValueChange={(value: string) => {
          setTab(value);
        }}
      >
        <TabsList aria-label="Fees">
          <TabsTrigger value="dues">Dues</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>
        <TabsContent value="dues" className="pt-2">
          <Suspense fallback={<TableFallback />}>
            <DuesPanel
              key={centre.id}
              centreId={centre.id}
              centreName={centre.name}
            />
          </Suspense>
        </TabsContent>
        <TabsContent value="payments" className="pt-2">
          <Suspense fallback={<TableFallback />}>
            <PaymentsPanel key={centre.id} centreId={centre.id} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </PreschoolPage>
  );
}

/** The active Centre's fees desk: who owes, and what was collected. */
export function FeesDeskScreen() {
  return (
    <RoleGate roles={["owner", "centre_head"]}>
      <FeesDesk />
    </RoleGate>
  );
}
