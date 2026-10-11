"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useId, useState, type SyntheticEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Spinner } from "@repo/ui/components/spinner";

import {
  useRequestReport,
  type RequestReportInput,
} from "@/src/queries/reports";

import { monthStart, type ReportDefinition } from "./report-catalogue";
import { ReportDownloads } from "./report-downloads";

/** Options for a card's optional filter; "all" is no filter. */
export type ReportFilterOption = { value: string; label: string };

const ALL = "all";

const FILTER_LABELS: Record<NonNullable<ReportDefinition["filter"]>, string> = {
  contractor: "Contractor",
  equipment: "Equipment",
};

const FILTER_ALL_LABELS: Record<
  NonNullable<ReportDefinition["filter"]>,
  string
> = {
  contractor: "All contractors",
  equipment: "All equipment",
};

function requestFor(
  definition: ReportDefinition,
  scope: string | null,
  period: { from: string; to: string; month: string },
  filter: string | null,
): RequestReportInput {
  // Only the central kinds are ever shown without a Project.
  const projectId = scope ?? "";
  const range = { from: period.from, to: period.to };
  switch (definition.kind) {
    case "labour_month":
    case "muster_roll":
      return {
        kind: definition.kind,
        projectId,
        params: { month: period.month },
      };
    case "labour_attendance":
    case "labour_payment":
    case "vendor_attendance":
      return {
        kind: definition.kind,
        projectId,
        params: { from: period.from, to: period.to },
      };
    // Site work reports (CM-605, CM-608).
    case "daily_work":
      return {
        kind: definition.kind,
        projectId,
        params: filter == null ? range : { ...range, contractorId: filter },
      };
    case "owned_equipment_usage":
    case "rented_equipment_usage":
      return {
        kind: definition.kind,
        projectId,
        params: filter == null ? range : { ...range, equipmentId: filter },
      };
    case "equipment_maintenance":
    case "equipment_transfers":
      return { kind: definition.kind, projectId: scope, params: range };
  }
}

/**
 * One report: what it contains, its period, and Generate. The job runs
 * while the request is open (until M9's queue), so the card shows progress
 * and then the downloads, or why it failed.
 */
export function ReportCard({
  definition,
  projectId,
  today,
  filterOptions = [],
}: {
  definition: ReportDefinition;
  /** Null for a central report (Masters → Equipments). */
  projectId: string | null;
  today: string;
  /** Choices for `definition.filter`; the filter shows only with some. */
  filterOptions?: readonly ReportFilterOption[];
}) {
  const id = useId();
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [filter, setFilter] = useState(ALL);
  const mutation = useRequestReport(projectId);
  const job = mutation.data;
  const rangeInvalid = definition.period === "range" && from > to;
  const filterItems =
    definition.filter == null || filterOptions.length === 0
      ? null
      : [
          { value: ALL, label: FILTER_ALL_LABELS[definition.filter] },
          ...filterOptions,
        ];

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rangeInvalid) return;
    mutation.mutate(
      requestFor(
        definition,
        projectId,
        { from, to, month },
        filterItems == null || filter === ALL ? null : filter,
      ),
    );
  }

  return (
    <Card className="flex flex-col">
      <form
        aria-label={definition.title}
        onSubmit={submit}
        className="flex flex-1 flex-col gap-4"
      >
        <CardHeader>
          <CardTitle>{definition.title}</CardTitle>
          <CardDescription>{definition.description}</CardDescription>
          <p className="text-muted-foreground text-xs">{definition.needs}</p>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          {definition.period === "range" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-from`}>From</Label>
                <Input
                  id={`${id}-from`}
                  type="date"
                  className="h-10"
                  value={from}
                  max={today}
                  onChange={(event) => {
                    setFrom(event.target.value);
                  }}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-to`}>To</Label>
                <Input
                  id={`${id}-to`}
                  type="date"
                  className="h-10"
                  value={to}
                  onChange={(event) => {
                    setTo(event.target.value);
                  }}
                  aria-invalid={rangeInvalid}
                  required
                />
              </div>
              {rangeInvalid ? (
                <p className="text-destructive col-span-2 text-sm" role="alert">
                  The period must end on or after the day it starts.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-month`}>Month</Label>
              <Input
                id={`${id}-month`}
                type="month"
                className="h-10 sm:w-48"
                value={month}
                onChange={(event) => {
                  setMonth(event.target.value);
                }}
                required
              />
            </div>
          )}

          {filterItems == null || definition.filter == null ? null : (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-filter`}>
                {FILTER_LABELS[definition.filter]}
              </Label>
              <Select
                items={filterItems}
                value={filter}
                onValueChange={(next) => {
                  if (next != null) setFilter(next);
                }}
              >
                <SelectTrigger id={`${id}-filter`} className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {filterItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mutation.isPending ? (
            <p
              className="text-muted-foreground flex items-center gap-2 text-sm"
              role="status"
            >
              <Spinner aria-hidden="true" />
              Generating the Excel and PDF…
            </p>
          ) : null}
          {mutation.isError ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>Could not generate</AlertTitle>
              <AlertDescription>{mutation.error.message}</AlertDescription>
            </Alert>
          ) : null}
          {!mutation.isPending && job?.status === "failed" ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>The report failed</AlertTitle>
              <AlertDescription>{job.error}</AlertDescription>
            </Alert>
          ) : null}
          {!mutation.isPending && job?.status === "done" ? (
            <div className="space-y-2" role="status">
              <p className="flex items-center gap-2 text-sm font-medium">
                <CircleCheck
                  aria-hidden="true"
                  className="size-4 text-emerald-600"
                />
                Ready to download
              </p>
              <ReportDownloads job={job} label={definition.title} />
            </div>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            disabled={mutation.isPending || rangeInvalid}
            className="w-full sm:w-auto"
          >
            {mutation.isPending ? "Generating…" : "Generate"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
