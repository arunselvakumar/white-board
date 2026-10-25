"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { Suspense, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { cn } from "@repo/ui/lib/utils";

import { FormAlert } from "@/components/auth/form-alert";
import { SiteWorkDocumentActivity } from "@/components/site-work/documents/site-work-document-activity";
import { SiteWorkDocumentPhotoStrip } from "@/components/site-work/documents/site-work-photo-strip";
import { ScrollTable } from "@/components/procurement/purchase-requests/scroll-table";
import { QueryHttpError } from "@/src/queries/http";
import { useDeleteSiteDiary, type SiteDiary } from "@/src/queries/site-diary";

import { formatRainfall, WeatherChip } from "./site-diary-parts";

function Fact({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words whitespace-pre-line">{children}</dd>
    </div>
  );
}

function time(value: string | null): string {
  return value ?? "—";
}

/**
 * One day's Site Diary (CM-607): weather in the morning and the
 * afternoon, rainfall, site condition, visitors, instructions, notes and
 * photos, with Edit and Delete for members who may.
 */
export function SiteDiaryView({
  diary,
  editHref,
  canAttach,
  onDeleted = () => undefined,
}: {
  diary: SiteDiary;
  editHref: string;
  /** Create or Update on the Site Diary: may add and remove photos. */
  canAttach: boolean;
  /** After a delete; the date's read refetches on its own. */
  onDeleted?: () => void;
}) {
  const remove = useDeleteSiteDiary(diary.id);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <article aria-label="Site Diary" className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <WeatherChip when="Morning" weather={diary.weatherMorning} />
          <WeatherChip when="Afternoon" weather={diary.weatherAfternoon} />
        </div>
        <div className="flex flex-wrap gap-2">
          {diary.actions.edit && (
            <Link
              href={editHref}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              <Pencil aria-hidden="true" />
              Edit
            </Link>
          )}
          {diary.actions.delete && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                setConfirm(true);
              }}
            >
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {error != null && <FormAlert message={error} />}

      <dl className="bg-card grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
        <Fact label="Rainfall">{formatRainfall(diary.rainfallMm)}</Fact>
        <Fact label="Site condition" className="sm:col-span-2">
          {diary.siteCondition ?? "—"}
        </Fact>
        <Fact label="Written by">
          {diary.createdBy.name ?? "A former member"}
        </Fact>
      </dl>

      <Suspense fallback={null}>
        <SiteWorkDocumentPhotoStrip
          documentType="site_diary"
          documentId={diary.id}
          label="Photos"
          max={8}
        />
      </Suspense>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Visitors</h3>
        {diary.visitors.length === 0 ? (
          <p className="text-muted-foreground text-sm">No visitors recorded.</p>
        ) : (
          <ScrollTable label="Visitors">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Organisation</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>In</TableHead>
                <TableHead>Out</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {diary.visitors.map((visitor, index) => (
                <TableRow key={`${visitor.name}-${String(index)}`}>
                  <TableCell className="font-medium">{visitor.name}</TableCell>
                  <TableCell>{visitor.organisation ?? "—"}</TableCell>
                  <TableCell className="min-w-40 whitespace-normal">
                    {visitor.purpose ?? "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {time(visitor.timeIn)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {time(visitor.timeOut)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ScrollTable>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Instructions</h3>
        {diary.instructions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No instructions recorded.
          </p>
        ) : (
          <ScrollTable label="Instructions">
            <TableHeader>
              <TableRow>
                <TableHead>Given by</TableHead>
                <TableHead>Given to</TableHead>
                <TableHead>Instruction</TableHead>
                <TableHead>Action taken</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {diary.instructions.map((row, index) => (
                <TableRow key={`${row.givenBy}-${String(index)}`}>
                  <TableCell className="font-medium">{row.givenBy}</TableCell>
                  <TableCell>{row.givenTo ?? "—"}</TableCell>
                  <TableCell className="min-w-56 whitespace-normal">
                    {row.instruction}
                  </TableCell>
                  <TableCell className="min-w-40 whitespace-normal">
                    {row.actionTaken ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ScrollTable>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Notes</h3>
        <p className="text-sm break-words whitespace-pre-line">
          {diary.notes ?? (
            <span className="text-muted-foreground">No notes.</span>
          )}
        </p>
      </div>

      <SiteWorkDocumentActivity
        documentType="site_diary"
        documentId={diary.id}
        canEdit={canAttach}
      />

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this Site Diary?</AlertDialogTitle>
            <AlertDialogDescription>
              Its weather, visitors, instructions and notes are removed. You can
              write a new diary for the date afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                setError(null);
                remove.mutate(diary.updatedAt, {
                  onSuccess: () => {
                    setConfirm(false);
                    onDeleted();
                  },
                  onError: (caught) => {
                    setConfirm(false);
                    setError(
                      caught instanceof QueryHttpError
                        ? caught.message
                        : "Something went wrong. Please try again.",
                    );
                  },
                });
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
