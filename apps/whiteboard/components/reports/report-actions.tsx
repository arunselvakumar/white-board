"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileSpreadsheet,
  FileText,
  Mail,
  MessageSquareText,
  Printer,
} from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Label } from "@repo/ui/components/label";
import { Spinner } from "@repo/ui/components/spinner";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { applyHttpFormError } from "@/lib/apply-http-form-error";
import { QueryHttpError } from "@/src/queries/http";
import {
  emailReport,
  reportDownloadHref,
  reportQueries,
  saveReportRemark,
  type ReportCatalogueItem,
  type ReportEmailResponse,
  type ReportParams,
} from "@/src/queries/reports";
import type { ReportRole } from "@/src/training-institute/domain/report-catalogue";

export const REPORT_REMARK_MAX = 300;

/**
 * Print, download and email for the report on screen. Every action uses the
 * same filters as the screen, so it carries exactly what the viewer sees.
 */
export function ReportActions({
  item,
  role,
  params,
  month,
}: {
  item: ReportCatalogueItem;
  role: ReportRole;
  params: ReportParams;
  /** The month a monthly report shows ("YYYY-MM"), for its remark. */
  month: string;
}) {
  const owner = role === "owner";
  const remarkStudentId =
    item.key === "monthly-student" && (owner || role === "teacher")
      ? (params.studentId ?? null)
      : null;
  return (
    <div
      aria-label="Report actions"
      role="group"
      className="flex flex-wrap items-center gap-2 print:hidden"
    >
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          window.print();
        }}
      >
        <Printer aria-hidden="true" />
        Print
      </Button>
      {item.excel ? (
        <a
          href={reportDownloadHref(item.key, "xlsx", params)}
          download
          className={buttonVariants({ variant: "outline" })}
        >
          <FileSpreadsheet aria-hidden="true" />
          Download Excel
        </a>
      ) : null}
      {item.pdf ? (
        <a
          href={reportDownloadHref(item.key, "pdf", params)}
          download
          className={buttonVariants({ variant: "outline" })}
        >
          <FileText aria-hidden="true" />
          Download PDF
        </a>
      ) : null}
      {owner ? (
        <EmailReportButton item={item} to="self" params={params} />
      ) : null}
      {owner && item.emailToParents ? (
        <EmailReportButton item={item} to="parents" params={params} />
      ) : null}
      {remarkStudentId == null ? null : (
        <RemarkButton
          reportKey={item.key}
          studentId={remarkStudentId}
          month={month}
        />
      )}
    </div>
  );
}

const EMAIL_COPY = {
  self: {
    button: "Email to me",
    title: "Email this report to you?",
    description:
      "Whiteboard sends this report, with the filters on screen, to your account email.",
  },
  parents: {
    button: "Email to parents",
    title: "Email this report to parents?",
    description:
      "Whiteboard sends each Student's report to their linked parents. Students without a parent email are listed after sending.",
  },
} as const;

function EmailReportButton({
  item,
  to,
  params,
}: {
  item: ReportCatalogueItem;
  to: "self" | "parents";
  params: ReportParams;
}) {
  const [open, setOpen] = useState(false);
  const send = useMutation({
    mutationFn: () => emailReport(item.key, to, params),
  });
  const copy = EMAIL_COPY[to];
  const error =
    send.error == null
      ? undefined
      : send.error instanceof QueryHttpError
        ? send.error.message
        : "Could not send the email. Please try again.";

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) send.reset();
      }}
    >
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Mail aria-hidden="true" />
        {copy.button}
      </Button>
      <AlertDialogContent>
        {send.data == null ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{copy.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {item.code} · {item.title}. {copy.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <FormAlert message={error} />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button
                type="button"
                disabled={send.isPending}
                onClick={() => {
                  send.mutate();
                }}
              >
                {send.isPending ? (
                  <Spinner aria-hidden="true" className="size-4" />
                ) : null}
                Send
              </Button>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {to === "self" ? "Report sent" : "Report emailed to parents"}
              </AlertDialogTitle>
              <AlertDialogDescription render={<div />}>
                <EmailResult result={send.data} to={to} />
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Done</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function EmailResult({
  result,
  to,
}: {
  result: ReportEmailResponse;
  to: "self" | "parents";
}) {
  if (to === "self") {
    const email = result.sent[0]?.email;
    return <p>Sent to {email ?? "your account email"}.</p>;
  }
  return (
    <div className="space-y-3 text-left">
      <p>
        Sent for {result.sent.length}{" "}
        {result.sent.length === 1 ? "Student" : "Students"}
        {result.notSent.length === 0
          ? "."
          : `; not sent for ${String(result.notSent.length)}.`}
      </p>
      {result.sent.length === 0 ? null : (
        <ul aria-label="Sent" className="max-h-48 space-y-1 overflow-y-auto">
          {result.sent.map((line) => (
            <li key={`${line.studentName}:${line.email}`}>
              <span className="text-foreground font-medium">
                {line.studentName}
              </span>{" "}
              — sent to {line.email}
            </li>
          ))}
        </ul>
      )}
      {result.notSent.length === 0 ? null : (
        <ul
          aria-label="Not sent"
          className="max-h-48 space-y-1 overflow-y-auto"
        >
          {result.notSent.map((line) => (
            <li key={line.studentName}>
              <span className="text-foreground font-medium">
                {line.studentName}
              </span>{" "}
              —{" "}
              <span className="text-destructive">not sent: {line.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const remarkSchema = z.object({
  text: z
    .string()
    .max(
      REPORT_REMARK_MAX,
      `A remark can be at most ${String(REPORT_REMARK_MAX)} characters.`,
    ),
});

type RemarkValues = z.infer<typeof remarkSchema>;

function RemarkButton({
  reportKey,
  studentId,
  month,
}: {
  reportKey: ReportCatalogueItem["key"];
  studentId: string;
  month: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        <MessageSquareText aria-hidden="true" />
        Add remark
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Remark for this month</DialogTitle>
          <DialogDescription>
            Shown on this Student&apos;s monthly report. You have one remark per
            month; saving replaces it, and saving it blank removes it.
          </DialogDescription>
        </DialogHeader>
        <RemarkForm
          reportKey={reportKey}
          studentId={studentId}
          month={month}
          onDone={() => {
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function RemarkForm({
  reportKey,
  studentId,
  month,
  onDone,
}: {
  reportKey: ReportCatalogueItem["key"];
  studentId: string;
  month: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RemarkValues>({
    resolver: zodResolver(remarkSchema),
    defaultValues: { text: "" },
  });
  const text = useWatch({ control, name: "text" });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          await saveReportRemark({
            studentId,
            month,
            text: values.text.trim(),
          });
          await queryClient.invalidateQueries({
            queryKey: [...reportQueries.key.documents(), reportKey],
          });
          onDone();
        } catch (error) {
          applyHttpFormError(
            error,
            setError,
            "Could not save the remark. Please try again.",
          );
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <div className="space-y-1.5">
        <Label htmlFor="report-remark">Remark</Label>
        <Textarea
          id="report-remark"
          rows={4}
          maxLength={REPORT_REMARK_MAX}
          aria-invalid={errors.text != null}
          aria-describedby="report-remark-count"
          {...register("text")}
        />
        <p
          id="report-remark-count"
          className="text-muted-foreground text-right text-xs tabular-nums"
        >
          {text.length}/{REPORT_REMARK_MAX}
        </p>
        <FieldError message={errors.text?.message} />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <Spinner aria-hidden="true" className="size-4" />
          ) : null}
          Save remark
        </Button>
      </DialogFooter>
    </form>
  );
}
