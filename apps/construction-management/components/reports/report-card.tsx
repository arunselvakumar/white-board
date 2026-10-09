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
import { Spinner } from "@repo/ui/components/spinner";

import {
  useRequestReport,
  type RequestReportInput,
} from "@/src/queries/reports";

import { monthStart, type ReportDefinition } from "./report-catalogue";
import { ReportDownloads } from "./report-downloads";

function requestFor(
  definition: ReportDefinition,
  projectId: string,
  period: { from: string; to: string; month: string },
): RequestReportInput {
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
}: {
  definition: ReportDefinition;
  projectId: string;
  today: string;
}) {
  const id = useId();
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const mutation = useRequestReport(projectId);
  const job = mutation.data;
  const rangeInvalid = definition.period === "range" && from > to;

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rangeInvalid) return;
    mutation.mutate(requestFor(definition, projectId, { from, to, month }));
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
