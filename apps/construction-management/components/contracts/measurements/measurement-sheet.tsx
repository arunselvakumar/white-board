"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { MapPin, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

import { FormAlert } from "@/components/auth/form-alert";
import { LocationLabel } from "@/components/locations/location-picker";
import { SiteRecordHeader } from "@/components/site-work/site-record-header";
import { fieldForCode } from "@/lib/server-errors";
import { MEASUREMENT_STATUS_LABELS } from "@/src/contracts/domain/contract-terms";
import {
  measurementQuery,
  measurementsPath,
  useMeasurementCommand,
  type MeasurementCommand,
  type MeasurementRow,
  type MeasurementSheet,
} from "@/src/queries/contracts-measurements";

import { MeasurementCumulative } from "./measurement-cumulative";
import { CheckMeasurementDialog, ReasonDialog } from "./measurement-dialogs";
import { localToday, MeasurementForm } from "./measurement-form";
import {
  dateText,
  MeasurementStatusBadge,
  quantity,
  sideText,
} from "./measurement-format";
import { MeasurementPhotosPanel } from "./measurement-photos";

type Dialog = "check" | "return" | "reopen" | "delete" | null;

/** A new draft sheet on one side (CM-1105). */
export function MeasurementNew({
  projectId,
  side,
  today,
}: {
  projectId: string;
  side: "client" | "contractor";
  today?: string;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="w-full max-w-6xl">
        <SiteRecordHeader
          back={{ label: "Measurements", href: measurementsPath(projectId) }}
          title={
            side === "client"
              ? "New client-side sheet"
              : "New contractor-side sheet"
          }
          meta="Saved as a draft. Submit it when the rows are in, for the joint measurement."
        />
      </div>
      <MeasurementForm
        projectId={projectId}
        side={side}
        sheet={null}
        today={today}
      />
    </div>
  );
}

/**
 * One measurement sheet (CM-1105): its header and actions (Submit, Check,
 * Return, Reopen, Delete, by the viewer's flags and the sheet's status),
 * the rows — editable while it is a draft the viewer may change, computing
 * as you type — the cumulative quantity per item with the deviation and
 * over-quantity marks, and the photos. A sheet a bill has taken is
 * read-only.
 */
export function MeasurementSheetPage({
  projectId,
  id,
  today = localToday(),
}: {
  projectId: string;
  id: string;
  today?: string;
}) {
  const router = useRouter();
  const { data: sheet } = useSuspenseQuery(measurementQuery(id));
  const command = useMeasurementCommand(id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | undefined>();
  const { allowed } = sheet;
  const run = (next: MeasurementCommand, after?: () => void) => {
    setError(undefined);
    command.mutate(next, {
      onSuccess: () => {
        setDialog(null);
        after?.();
      },
      onError: (failure) => {
        setError(fieldForCode(failure, {}).message);
      },
    });
  };
  const stamp = { expectedUpdatedAt: sheet.updatedAt };
  const editing = sheet.status === "draft" && allowed.edit;
  const party = sheet.partyLabel == null ? "" : ` · ${sheet.partyLabel}`;

  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-4">
      <SiteRecordHeader
        size="detail"
        back={{ label: "Measurements", href: measurementsPath(projectId) }}
        title={`Measurement sheet · ${dateText(sheet.measuredOn)}`}
        meta={
          <span className="inline-flex flex-wrap items-center gap-2">
            <MeasurementStatusBadge
              status={sheet.status}
              billed={sheet.billed}
            />
            <span>{`${sideText(sheet.side, sheet.workOrderNumber)}${party}`}</span>
          </span>
        }
        actions={
          <>
            {allowed.submit ? (
              <Button
                type="button"
                size="sm"
                disabled={command.isPending || sheet.rowCount === 0}
                onClick={() => {
                  run({ kind: "submit", ...stamp });
                }}
              >
                Submit for checking
              </Button>
            ) : null}
            {allowed.check ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setError(undefined);
                  setDialog("check");
                }}
              >
                Check
              </Button>
            ) : null}
            {allowed.return ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setError(undefined);
                  setDialog("return");
                }}
              >
                Return to draft
              </Button>
            ) : null}
            {allowed.reopen ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setError(undefined);
                  setDialog("reopen");
                }}
              >
                Reopen
              </Button>
            ) : null}
            {allowed.delete ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => {
                  setError(undefined);
                  setDialog("delete");
                }}
              >
                Delete
              </Button>
            ) : null}
          </>
        }
      />
      {dialog == null ? <FormAlert message={error} /> : null}
      {sheet.billed ? (
        <Alert>
          <AlertTitle>Billed</AlertTitle>
          <AlertDescription>
            A bill has taken rows of this sheet, so it cannot be changed.
            Reverse the bill to correct it.
          </AlertDescription>
        </Alert>
      ) : null}
      {sheet.returnReason != null && sheet.status === "draft" ? (
        <Alert variant="destructive">
          <AlertTitle>Returned to draft</AlertTitle>
          <AlertDescription>{sheet.returnReason}</AlertDescription>
        </Alert>
      ) : null}
      {sheet.reopenReason != null && sheet.status === "submitted" ? (
        <Alert>
          <AlertTitle>Reopened</AlertTitle>
          <AlertDescription>{sheet.reopenReason}</AlertDescription>
        </Alert>
      ) : null}
      {sheet.warnings.length > 0 ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Over the Work Order</AlertTitle>
          <AlertDescription>
            <ul className="space-y-1">
              {sheet.warnings.map((warning) => (
                <li key={warning.lineId}>{warning.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {editing ? (
        <MeasurementForm
          // A save reloads the sheet: start the form again from what was saved.
          key={sheet.updatedAt}
          projectId={projectId}
          side={sheet.side}
          sheet={sheet}
          today={today}
          onSaved={() => undefined}
        />
      ) : (
        <>
          <SheetFacts sheet={sheet} />
          <SheetRows projectId={projectId} sheet={sheet} />
          <MeasurementCumulative
            side={sheet.side}
            limit={sheet.deviationLimitPercent}
            deviationsHref={`/app/projects/${projectId}/boq?tab=deviations`}
            items={sheet.items.map((item) => ({
              itemId: item.itemId,
              itemNo: item.item?.itemNo ?? null,
              description: item.item?.description ?? "Item removed",
              uomName: item.item?.uomName ?? "",
              planned: item.planned,
              checked: item.checked,
              thisSheet: item.thisSheet,
              total: item.total,
              over: item.over,
              overLimit: item.overLimit,
              percentOver: item.percentOver,
            }))}
          />
        </>
      )}

      <Suspense fallback={null}>
        <MeasurementPhotosPanel sheetId={sheet.id} />
      </Suspense>

      {dialog === "check" ? (
        <CheckMeasurementDialog
          side={sheet.side}
          partyLabel={sheet.partyLabel}
          measuredOn={sheet.measuredOn}
          today={today}
          pending={command.isPending}
          error={error}
          onConfirm={(values) => {
            run({ kind: "check", ...values, ...stamp });
          }}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === "return" ? (
        <ReasonDialog
          title="Return this sheet to draft?"
          description="Whoever drafted it can correct the rows and submit it again. The reason is shown on the sheet."
          empty="Write what needs correcting."
          confirm="Return to draft"
          busyLabel="Returning…"
          pending={command.isPending}
          error={error}
          onConfirm={(reason) => {
            run({ kind: "return", reason, ...stamp });
          }}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === "reopen" ? (
        <ReasonDialog
          title="Reopen this checked sheet?"
          description="The joint measurement is cleared and the sheet goes back to submitted, so its rows stop counting as measured until it is checked again."
          empty="Write why it is reopened."
          confirm="Reopen"
          busyLabel="Reopening…"
          destructive
          pending={command.isPending}
          error={error}
          onConfirm={(reason) => {
            run({ kind: "reopen", reason, ...stamp });
          }}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      <AlertDialog
        open={dialog === "delete"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this sheet?</AlertDialogTitle>
            <AlertDialogDescription>
              {sheet.status === "checked"
                ? "The joint measurement and its rows are removed, and they stop counting as measured."
                : "The sheet and its rows are removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FormAlert message={dialog === "delete" ? error : undefined} />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={command.isPending}
              onClick={() => {
                run({ kind: "delete", ...stamp }, () => {
                  router.push(measurementsPath(projectId));
                });
              }}
            >
              {command.isPending ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words">{value}</dd>
    </div>
  );
}

/** The header and the joint measurement, read-only. */
function SheetFacts({ sheet }: { sheet: MeasurementSheet }) {
  return (
    <section
      aria-label="Sheet"
      className="min-w-0 space-y-3 rounded-xl border p-4"
    >
      <dl className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Measured on" value={dateText(sheet.measuredOn)} />
        <Fact label="Title" value={sheet.title ?? "—"} />
        <Fact label="Status" value={MEASUREMENT_STATUS_LABELS[sheet.status]} />
        <Fact label="Drafted by" value={sheet.createdByName ?? "—"} />
        {sheet.status === "checked" ? (
          <>
            <Fact
              label="Checked by (our engineer)"
              value={sheet.checkedByName ?? "—"}
            />
            <Fact
              label="Other party"
              value={`${sheet.partyName ?? "—"}${sheet.partyRole == null ? "" : ` (${sheet.partyRole})`}`}
            />
            <Fact
              label="Joint measurement on"
              value={dateText(sheet.jointOn)}
            />
          </>
        ) : null}
      </dl>
      {sheet.remarks == null ? null : (
        <p className="text-muted-foreground text-sm whitespace-pre-line">
          {sheet.remarks}
        </p>
      )}
    </section>
  );
}

function numbers(row: MeasurementRow): string {
  if (row.direct) return "Direct";
  return [
    row.nos == null ? "1" : quantity(row.nos),
    ...[row.length, row.breadth, row.depth]
      .filter((value) => value != null)
      .map((value) => quantity(value)),
  ].join(" × ");
}

/** The rows, read-only: a list of cards below md, a grid above. */
function SheetRows({
  projectId,
  sheet,
}: {
  projectId: string;
  sheet: MeasurementSheet;
}) {
  return (
    <section
      aria-labelledby="measurement-sheet-rows"
      className="min-w-0 space-y-3 rounded-xl border p-4"
    >
      <h3 id="measurement-sheet-rows" className="font-semibold">
        Rows
      </h3>
      {sheet.rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No rows.</p>
      ) : (
        <ol aria-label="Rows" className="divide-y">
          {sheet.rows.map((row, index) => {
            const negative = row.quantity.startsWith("-");
            return (
              <li
                key={row.id}
                aria-label={`Row ${String(index + 1)}`}
                className="grid min-w-0 gap-1 py-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_8rem] md:items-start md:gap-3"
              >
                <p className="min-w-0 text-sm font-medium break-words">
                  {row.item == null
                    ? "Item removed"
                    : `${row.item.itemNo ?? "—"} · ${row.item.description}`}
                </p>
                <div className="min-w-0 text-sm">
                  <p className="break-words">{row.description ?? "—"}</p>
                  {row.location == null ? null : (
                    <p className="text-muted-foreground flex items-center gap-1 text-xs">
                      <MapPin aria-hidden="true" className="size-3 shrink-0" />
                      <Suspense fallback="Location">
                        <LocationLabel
                          projectId={projectId}
                          value={row.location}
                          className="truncate"
                        />
                      </Suspense>
                    </p>
                  )}
                </div>
                <p className="text-muted-foreground text-xs tabular-nums md:text-sm">
                  {numbers(row)}
                </p>
                <div className="flex items-center gap-2 md:flex-col md:items-end">
                  <span
                    className={cn(
                      "text-sm font-medium tabular-nums",
                      negative && "text-destructive",
                    )}
                  >
                    {`${quantity(row.quantity)} ${row.item?.uomName ?? ""}`}
                  </span>
                  {row.over ? (
                    <Badge variant="destructive">
                      <TriangleAlert aria-hidden="true" />
                      {sheet.side === "client" ? "Deviation" : "Over WO"}
                    </Badge>
                  ) : negative ? (
                    <Badge variant="outline">Deduction</Badge>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
