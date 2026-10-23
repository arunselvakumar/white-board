"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  FileDown,
  FileUp,
  LineChart,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { PageHeader } from "@/components/app-shell/page-header";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  PRICE_INDEX_EXPORT_URL,
  PRICE_INDEX_SAMPLE_URL,
  priceIndicesQuery,
  useImportPriceIndices,
  usePriceIndexCommand,
  type PriceIndex,
} from "@/src/queries/contracts-escalation";
import { QueryHttpError } from "@/src/queries/http";

import { indexText, monthText } from "./escalation-format";

type Editing =
  { kind: "add"; series: string } | { kind: "edit"; index: PriceIndex } | null;

/**
 * Master records → Price indices (CM-1109, ADR CM-0023 §9): the series the
 * Company tracks (WPI, CPI-IW, cement, steel, bitumen, POL or any other),
 * typed each month or imported from Excel, never fetched. One card per
 * series with its months; actions show by the Item Library's flags, whose
 * menu price indices share.
 */
export function PriceIndicesPage() {
  const list = useSuspenseQuery(priceIndicesQuery()).data;
  const flags = list.viewerFlags;
  const [editing, setEditing] = useState<Editing>(null);
  const [importing, setImporting] = useState(false);
  const command = usePriceIndexCommand();

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Masters", href: "/app/masters" }}
          title="Price indices"
          meta="The indices escalation bills are worked out from: typed each month or imported, never fetched."
          actions={
            <>
              {flags.includes("export") ? (
                <a
                  href={PRICE_INDEX_EXPORT_URL}
                  className={buttonVariants({ variant: "outline" })}
                >
                  <FileDown aria-hidden="true" />
                  Export
                </a>
              ) : null}
              {flags.includes("import") ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setImporting(true);
                  }}
                >
                  <FileUp aria-hidden="true" />
                  Import
                </Button>
              ) : null}
              {flags.includes("create") ? (
                <Button
                  type="button"
                  onClick={() => {
                    setEditing({ kind: "add", series: "" });
                  }}
                >
                  <Plus aria-hidden="true" />
                  Add index
                </Button>
              ) : null}
            </>
          }
        />
        {list.series.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LineChart aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No price indices yet</EmptyTitle>
              <EmptyDescription>
                Type each month&apos;s WPI, CPI-IW or material index, or import
                them from the sample sheet. Escalation bills need the base month
                and every month of their period.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-4">
            {list.series.map((series) => (
              <section
                key={series.name}
                aria-label={series.name}
                className="min-w-0 space-y-3 rounded-lg border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold break-words">{series.name}</h2>
                  {flags.includes("create") ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing({ kind: "add", series: series.name });
                      }}
                    >
                      <Plus aria-hidden="true" />
                      Add month
                    </Button>
                  ) : null}
                </div>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {series.indices.map((index) => (
                    <li
                      key={index.id}
                      className="bg-muted/40 flex min-w-0 items-center justify-between gap-1 rounded-md px-2 py-1.5 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="text-muted-foreground block text-xs">
                          {monthText(index.month)}
                        </span>
                        <span className="font-medium tabular-nums">
                          {indexText(index.value)}
                        </span>
                      </span>
                      <span className="flex shrink-0">
                        {flags.includes("update") ? (
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Edit ${series.name} ${monthText(index.month)}`}
                            onClick={() => {
                              setEditing({ kind: "edit", index });
                            }}
                          >
                            <Pencil aria-hidden="true" />
                          </Button>
                        ) : null}
                        {flags.includes("delete") ? (
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Delete ${series.name} ${monthText(index.month)}`}
                            disabled={command.isPending}
                            onClick={() => {
                              command.mutate({ kind: "delete", id: index.id });
                            }}
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
      <PriceIndexDialog
        editing={editing}
        suggestions={[
          ...list.series.map((series) => series.name),
          ...list.suggestions,
        ]}
        onClose={() => {
          setEditing(null);
        }}
      />
      <ImportPriceIndicesDialog open={importing} onOpenChange={setImporting} />
    </div>
  );
}

/** Add a month of a series, or change a month's value. */
export function PriceIndexDialog({
  editing,
  suggestions,
  onClose,
}: {
  editing: Editing;
  suggestions: readonly string[];
  onClose: () => void;
}) {
  const command = usePriceIndexCommand();
  const [error, setError] = useState<{
    field: string | null;
    message: string;
  } | null>(null);
  const open = editing != null;
  const editIndex = editing?.kind === "edit" ? editing.index : null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="grid-cols-1 sm:max-w-md">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const value = String(data.get("value") ?? "").trim();
            const done = {
              onSuccess: () => {
                setError(null);
                onClose();
              },
              onError: (failure: Error) => {
                setError(
                  fieldForCode(failure, {
                    PRICE_INDEX_SERIES_REQUIRED: "series",
                    PRICE_INDEX_SERIES_TOO_LONG: "series",
                    PRICE_INDEX_MONTH_INVALID: "month",
                    PRICE_INDEX_EXISTS: "month",
                    PRICE_INDEX_VALUE_INVALID: "value",
                  }),
                );
              },
            };
            if (editIndex != null)
              command.mutate(
                {
                  kind: "update",
                  id: editIndex.id,
                  value,
                  expectedUpdatedAt: editIndex.updatedAt,
                },
                done,
              );
            else
              command.mutate(
                {
                  kind: "create",
                  input: {
                    series: String(data.get("series") ?? ""),
                    month: String(data.get("month") ?? ""),
                    value,
                  },
                },
                done,
              );
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {editIndex == null ? "Add index" : "Edit index"}
            </DialogTitle>
            <DialogDescription>
              {editIndex == null
                ? "One value per series and month, as published (four decimals at most)."
                : `${editIndex.series}, ${monthText(editIndex.month)}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-w-0 gap-4">
            {editIndex == null ? (
              <>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="price-index-series">Series</Label>
                  <Input
                    id="price-index-series"
                    name="series"
                    list="price-index-series-options"
                    defaultValue={editing?.kind === "add" ? editing.series : ""}
                    aria-invalid={error?.field === "series"}
                  />
                  <datalist id="price-index-series-options">
                    {suggestions.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  <FieldError
                    message={
                      error?.field === "series" ? error.message : undefined
                    }
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="price-index-month">Month</Label>
                  <Input
                    id="price-index-month"
                    name="month"
                    type="month"
                    aria-invalid={error?.field === "month"}
                  />
                  <FieldError
                    message={
                      error?.field === "month" ? error.message : undefined
                    }
                  />
                </div>
              </>
            ) : null}
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="price-index-value">Index value</Label>
              <Input
                id="price-index-value"
                name="value"
                inputMode="decimal"
                defaultValue={
                  editIndex == null ? "" : indexText(editIndex.value)
                }
                aria-invalid={error?.field === "value"}
              />
              <FieldError
                message={error?.field === "value" ? error.message : undefined}
              />
            </div>
          </div>
          <FormAlert
            message={error?.field == null ? error?.message : undefined}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={command.isPending}>
              {command.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type RowError = { row: number; column: string; message: string };

function rowErrorsOf(error: unknown): RowError[] {
  if (!(error instanceof QueryHttpError)) return [];
  const details = error.details as { errors?: RowError[] } | null | undefined;
  return details?.errors ?? [];
}

/** Upload the filled sample; every row or none, with the rows at fault. */
export function ImportPriceIndicesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const upload = useImportPriceIndices();
  const [file, setFile] = useState<File | null>(null);
  const errors = rowErrorsOf(upload.error);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          upload.reset();
          setFile(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="grid-cols-1 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import price indices</DialogTitle>
          <DialogDescription>
            Series, Month (YYYY-MM) and Value. A month already kept for a series
            gets the new value. Every row is saved, or none.{" "}
            <a
              href={PRICE_INDEX_SAMPLE_URL}
              className="underline underline-offset-4"
            >
              Download the sample
            </a>
            .
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-3">
          <Label htmlFor="price-index-file">Excel file (.xlsx)</Label>
          <Input
            id="price-index-file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              upload.reset();
              setFile(event.currentTarget.files?.[0] ?? null);
            }}
          />
          {upload.data != null ? (
            <p className="text-sm" role="status">
              {`Added ${String(upload.data.created)}, updated ${String(upload.data.updated)}, unchanged ${String(upload.data.unchanged)}.`}
            </p>
          ) : null}
          {upload.error != null ? (
            <FormAlert message={upload.error.message} />
          ) : null}
          {errors.length > 0 ? (
            <ul
              aria-label="Rows to fix"
              className="max-h-48 space-y-1 overflow-y-auto text-sm"
            >
              {errors.map((row) => (
                <li key={`${String(row.row)}-${row.column}`}>
                  Row {row.row}, {row.column}: {row.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Close
          </Button>
          <Button
            type="button"
            disabled={file == null || upload.isPending}
            onClick={() => {
              if (file != null) upload.mutate(file);
            }}
          >
            {upload.isPending ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
