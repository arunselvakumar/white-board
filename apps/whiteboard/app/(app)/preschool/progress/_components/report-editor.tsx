"use client";

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { cn } from "@repo/ui/lib/utils";

import { FormAlert } from "@/components/auth/form-alert";
import { formatDate } from "@/app/(app)/preschool/_components/preschool-format";
import { QueryHttpError } from "@/src/queries/http";
import {
  preschoolDomainsQueryOptions,
  preschoolObservationsQueryOptions,
} from "@/src/queries/preschool/observations";
import {
  PRESCHOOL_RATING_LABELS,
  preschoolProgressReportKeys,
  preschoolProgressReportQueryOptions,
  publishPreschoolProgressReport,
  savePreschoolProgressReport,
  unpublishPreschoolProgressReport,
  type PreschoolProgressRating,
  type PreschoolProgressReport,
  type PreschoolTerm,
} from "@/src/queries/preschool/progress-reports";

const RATINGS = ["beginning", "progressing", "proficient"] as const;

export type EditorTarget = {
  childId: string;
  childName: string;
  reportId: string | null;
  term: PreschoolTerm;
  termLabel: string;
  termStartsOn: string;
  termEndsOn: string;
  academicYearId: string;
};

type Row = { rating: PreschoolProgressRating | null; remark: string };

function messageOf(error: unknown, fallback: string): string {
  return error instanceof QueryHttpError && error.message !== ""
    ? error.message
    : fallback;
}

function isRating(value: unknown): value is PreschoolProgressRating {
  return RATINGS.includes(value as PreschoolProgressRating);
}

function Editor({
  target,
  report,
  canUnpublish,
  onBack,
}: {
  target: EditorTarget;
  report: PreschoolProgressReport | null;
  canUnpublish: boolean;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: domains } = useSuspenseQuery(preschoolDomainsQueryOptions());
  const { data: observations } = useSuspenseQuery(
    preschoolObservationsQueryOptions({
      childId: target.childId,
      from: target.termStartsOn,
      to: target.termEndsOn,
      limit: 100,
    }),
  );
  const [current, setCurrent] = useState(report);
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      (report?.ratings ?? []).map((rating) => [
        rating.domainId,
        { rating: rating.rating, remark: rating.remark ?? "" },
      ]),
    ),
  );
  const [remarks, setRemarks] = useState(report?.teacherRemarks ?? "");
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: preschoolProgressReportKeys.all,
    });

  const save = async (): Promise<PreschoolProgressReport> => {
    const saved = await savePreschoolProgressReport({
      childId: target.childId,
      term: target.term,
      academicYearId: target.academicYearId,
      ratings: Object.entries(rows).flatMap(([domainId, row]) =>
        row.rating == null
          ? []
          : [
              {
                domainId,
                rating: row.rating,
                remark: row.remark.trim() === "" ? null : row.remark,
              },
            ],
      ),
      teacherRemarks: remarks.trim() === "" ? null : remarks,
    });
    setCurrent(saved);
    return saved;
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await work();
      await refresh();
    } catch (caught) {
      if (
        caught instanceof QueryHttpError &&
        caught.code === "PROGRESS_REPORT_INCOMPLETE"
      ) {
        const details = caught.details as { missingDomainIds?: string[] };
        setMissing(details.missingDomainIds ?? []);
      }
      setError(messageOf(caught, "Could not save. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const byDomain = new Map<string, typeof observations.items>();
  for (const item of observations.items)
    byDomain.set(item.domainId, [...(byDomain.get(item.domainId) ?? []), item]);
  const status = current?.status ?? "none";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          All Children
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={status === "published" ? "default" : "secondary"}>
            {status === "published"
              ? "Published"
              : status === "draft"
                ? "Draft"
                : "Not started"}
          </Badge>
          {current == null ? null : (
            <Link
              href={`/preschool/progress/reports/${current.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Printer aria-hidden="true" />
              Print view
            </Link>
          )}
        </div>
      </div>
      <div>
        <h2 className="text-xl font-semibold">{target.childName}</h2>
        <p className="text-muted-foreground text-sm">
          {target.termLabel} · {formatDate(target.termStartsOn)} to{" "}
          {formatDate(target.termEndsOn)}
          {current == null
            ? null
            : ` · Present ${String(current.attendance.present)} of ${String(current.attendance.marked)} marked days`}
        </p>
      </div>
      <FormAlert message={error} />
      <ol className="space-y-4" aria-label="Development Domains">
        {domains.items.map((domain) => {
          const row = rows[domain.id] ?? { rating: null, remark: "" };
          const notes = byDomain.get(domain.id) ?? [];
          const unrated = missing.includes(domain.id) && row.rating == null;
          return (
            <li
              key={domain.id}
              aria-label={domain.name}
              className={cn(
                "space-y-3 rounded-xl border p-3",
                unrated && "border-destructive",
              )}
            >
              <div>
                <h3 className="font-medium">{domain.name}</h3>
                {domain.description == null ? null : (
                  <p className="text-muted-foreground text-xs">
                    {domain.description}
                  </p>
                )}
              </div>
              <ToggleGroup
                aria-label={`Rating for ${domain.name}`}
                variant="outline"
                size="sm"
                spacing={0}
                value={row.rating == null ? [] : [row.rating]}
                onValueChange={(next: unknown[]) => {
                  const picked = next.find(isRating) ?? null;
                  setRows((all) => ({
                    ...all,
                    [domain.id]: { ...row, rating: picked },
                  }));
                }}
              >
                {RATINGS.map((rating) => (
                  <ToggleGroupItem
                    key={rating}
                    value={rating}
                    className="aria-pressed:bg-primary aria-pressed:text-primary-foreground flex-1 px-3"
                  >
                    {PRESCHOOL_RATING_LABELS[rating]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {unrated ? (
                <p className="text-destructive text-sm">Choose a rating.</p>
              ) : null}
              <Input
                aria-label={`Remark for ${domain.name}`}
                placeholder="Remark (optional)"
                className="h-9"
                maxLength={500}
                value={row.remark}
                onChange={(event) => {
                  setRows((all) => ({
                    ...all,
                    [domain.id]: { ...row, remark: event.target.value },
                  }));
                }}
              />
              {notes.length === 0 ? null : (
                <details className="text-sm">
                  <summary className="text-muted-foreground cursor-pointer">
                    {notes.length} Observation{notes.length === 1 ? "" : "s"}{" "}
                    this term
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {notes.map((note) => (
                      <li key={note.id}>
                        <span className="text-muted-foreground text-xs">
                          {formatDate(note.observedOn)}:
                        </span>{" "}
                        {note.note}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ol>
      <div className="space-y-1.5">
        <Label htmlFor="teacher-remarks">Teacher&apos;s remarks</Label>
        <Textarea
          id="teacher-remarks"
          rows={4}
          maxLength={4000}
          value={remarks}
          onChange={(event) => {
            setRemarks(event.target.value);
          }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            void run(async () => {
              await save();
            });
          }}
        >
          {status === "published" ? "Save correction" : "Save draft"}
        </Button>
        {status === "published" ? (
          canUnpublish ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                void run(async () => {
                  if (current != null)
                    setCurrent(
                      await unpublishPreschoolProgressReport(current.id),
                    );
                });
              }}
            >
              Unpublish
            </Button>
          ) : null
        ) : (
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              setConfirming(true);
            }}
          >
            Publish
          </Button>
        )}
      </div>
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open) setConfirming(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Publish {target.childName}&apos;s {target.termLabel} report?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The Parents are emailed that it is ready and can read it. Every
              Development Domain needs a rating.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <Button
              type="button"
              onClick={() => {
                setConfirming(false);
                void run(async () => {
                  const saved = await save();
                  setMissing([]);
                  setCurrent(await publishPreschoolProgressReport(saved.id));
                });
              }}
            >
              Publish
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SavedReport(props: {
  target: EditorTarget & { reportId: string };
  canUnpublish: boolean;
  onBack: () => void;
}) {
  const { data } = useSuspenseQuery(
    preschoolProgressReportQueryOptions(props.target.reportId),
  );
  return <Editor {...props} report={data} />;
}

/** One Child's report for the term: a rating and remark per Domain, the term's Observations beside each. */
export function ReportEditor({
  target,
  canUnpublish,
  onBack,
}: {
  target: EditorTarget;
  canUnpublish: boolean;
  onBack: () => void;
}) {
  const { reportId } = target;
  return reportId == null ? (
    <Editor
      target={target}
      report={null}
      canUnpublish={canUnpublish}
      onBack={onBack}
    />
  ) : (
    <SavedReport
      target={{ ...target, reportId }}
      canUnpublish={canUnpublish}
      onBack={onBack}
    />
  );
}
