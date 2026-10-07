"use client";

import { useAuth } from "@clerk/nextjs";
import {
  useMutation,
  useQueryClient,
  useSuspenseQueries,
} from "@tanstack/react-query";
import {
  CalendarClock,
  CircleCheck,
  CircleX,
  Phone,
  UserRoundPlus,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button } from "@repo/ui/components/button";

import { PageHeader } from "@/components/app-shell/page-header";
import { isOwnerRole } from "@/lib/workspace-access";
import {
  bookDemo,
  cancelDemo,
  enquiryQueries,
  logEnquiryFollowUp,
  markDemoAttendance,
  markDemoFeePaid,
  markEnquiryNotInterested,
  reopenEnquiry,
  type BookDemoInput,
  type EnquiryDetailResponse,
  type EnquiryOptionsResponse,
} from "@/src/queries/enquiries";

import { BookDemoDialog } from "./book-demo-dialog";
import { DemoList, type DemoActions } from "./demo-card";
import { errorMessage } from "./enquiry-errors";
import {
  enquiryInterest,
  isClosedStage,
  preferredClassModeLabel,
  shortDate,
  timestampDate,
  todayInKolkata,
} from "./enquiry-format";
import { EnquiryHistory } from "./enquiry-history";
import { EnquiryStageBadge } from "./enquiry-stage-badge";
import { FollowUpDialog, type FollowUpInput } from "./follow-up-dialog";
import { NotInterestedDialog } from "./not-interested-dialog";

type Dialog = "follow-up" | "book-demo" | "not-interested" | null;

export function EnquiryDetailScreen({ enquiryId }: { enquiryId: string }) {
  const { orgRole } = useAuth();
  const queryClient = useQueryClient();
  const [{ data: enquiry }, { data: options }] = useSuspenseQueries({
    queries: [enquiryQueries.detail(enquiryId), enquiryQueries.options()],
  });
  const onSuccess = () =>
    queryClient.invalidateQueries({ queryKey: enquiryQueries.key.all });
  const followUp = useMutation({
    mutationFn: (input: FollowUpInput) => logEnquiryFollowUp(enquiryId, input),
    onSuccess,
  });
  const notInterested = useMutation({
    mutationFn: (reason: string) => markEnquiryNotInterested(enquiryId, reason),
    onSuccess,
  });
  const reopen = useMutation({
    mutationFn: () => reopenEnquiry(enquiryId),
    onSuccess,
  });
  const book = useMutation({
    mutationFn: (input: BookDemoInput) => bookDemo(enquiryId, input),
    onSuccess,
  });
  const attendance = useMutation({
    mutationFn: ({ demoId, attended }: { demoId: string; attended: boolean }) =>
      markDemoAttendance(demoId, attended),
    onSuccess,
  });
  const paid = useMutation({ mutationFn: markDemoFeePaid, onSuccess });
  const cancel = useMutation({ mutationFn: cancelDemo, onSuccess });

  return (
    <EnquiryDetailView
      enquiry={enquiry}
      options={options}
      isOwner={isOwnerRole(orgRole)}
      reopening={reopen.isPending}
      onFollowUp={async (input) => {
        await followUp.mutateAsync(input);
      }}
      onNotInterested={async (reason) => {
        await notInterested.mutateAsync(reason);
      }}
      onReopen={async () => {
        await reopen.mutateAsync();
      }}
      onBookDemo={async (input) => {
        await book.mutateAsync(input);
      }}
      demoActions={{
        onMarkAttendance: async (demoId, attended) => {
          await attendance.mutateAsync({ demoId, attended });
        },
        onMarkPaid: async (demoId) => {
          await paid.mutateAsync(demoId);
        },
        onCancel: async (demoId) => {
          await cancel.mutateAsync(demoId);
        },
      }}
    />
  );
}

function Card({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={`bg-card rounded-2xl border p-5 shadow-sm sm:p-6 ${className}`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

function StatusCallout({
  enquiry,
  isOwner,
  today,
}: {
  enquiry: EnquiryDetailResponse;
  isOwner: boolean;
  today: string;
}) {
  if (enquiry.stage === "joined") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100">
        <p className="flex items-center gap-2 text-sm font-medium">
          <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
          Joined as a Student
          {enquiry.convertedAt == null
            ? "."
            : ` on ${timestampDate(enquiry.convertedAt)}.`}
        </p>
        {enquiry.convertedStudentId == null ? null : (
          <Button
            size="sm"
            variant="outline"
            render={<Link href={`/students/${enquiry.convertedStudentId}`} />}
          >
            View Student
          </Button>
        )}
      </div>
    );
  }
  if (enquiry.stage === "not_interested") {
    return (
      <div className="bg-muted/50 rounded-2xl border p-4">
        <p className="flex items-start gap-2 text-sm">
          <CircleX
            aria-hidden="true"
            className="text-muted-foreground mt-0.5 size-4 shrink-0"
          />
          <span>
            <span className="font-medium">Not interested:</span>{" "}
            {enquiry.notInterestedReason ?? "No reason recorded"}
          </span>
        </p>
      </div>
    );
  }
  if (enquiry.followUpDue && enquiry.nextFollowUpOn != null) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
        <CalendarClock aria-hidden="true" className="size-4 shrink-0" />
        {enquiry.nextFollowUpOn === today
          ? "Follow-up due today."
          : `Follow-up was due on ${shortDate(enquiry.nextFollowUpOn)}.`}
      </div>
    );
  }
  if (enquiry.stage === "demo_attended" && isOwner) {
    return (
      <div className="border-primary/30 bg-primary/5 flex items-center gap-2 rounded-2xl border p-4 text-sm">
        <UserRoundPlus aria-hidden="true" className="text-primary size-4" />
        Demo attended. Convert to Student when they’re ready to join.
      </div>
    );
  }
  return null;
}

export function EnquiryDetailView({
  enquiry,
  options,
  isOwner,
  reopening = false,
  onFollowUp,
  onNotInterested,
  onReopen,
  onBookDemo,
  demoActions,
  today = todayInKolkata(),
}: {
  enquiry: EnquiryDetailResponse;
  options: EnquiryOptionsResponse;
  isOwner: boolean;
  reopening?: boolean;
  onFollowUp: (input: FollowUpInput) => Promise<void>;
  onNotInterested: (reason: string) => Promise<void>;
  onReopen: () => Promise<void>;
  onBookDemo: (input: BookDemoInput) => Promise<void>;
  demoActions: DemoActions;
  today?: string;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const closed = isClosedStage(enquiry.stage);
  const joined = enquiry.stage === "joined";
  const convertFirst = isOwner && enquiry.stage === "demo_attended";
  const interest = enquiryInterest(enquiry);
  const hasBookedDemos = enquiry.demos.some(
    (demo) => demo.cancelledAt == null && demo.attendance === "unmarked",
  );
  const runReopen = () => {
    setActionError(null);
    onReopen().catch((error: unknown) => {
      setActionError(errorMessage(error, "Could not reopen this Enquiry."));
    });
  };
  const openDialog = (next: Dialog) => () => {
    setActionError(null);
    setDialog(next);
  };

  return (
    <main className="w-full p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          back={{ href: "/enquiries", label: "Enquiries" }}
          title={enquiry.prospectName}
          actions={
            joined ? null : closed ? (
              <>
                <Button
                  variant="outline"
                  render={<Link href={`/enquiries/${enquiry.id}/edit`} />}
                >
                  Edit details
                </Button>
                <Button disabled={reopening} onClick={runReopen}>
                  {reopening ? "Reopening…" : "Reopen"}
                </Button>
              </>
            ) : (
              <>
                {convertFirst ? (
                  <Button
                    render={<Link href={`/enquiries/${enquiry.id}/convert`} />}
                  >
                    <UserRoundPlus aria-hidden="true" />
                    Convert to Student
                  </Button>
                ) : null}
                <Button
                  variant={convertFirst ? "outline" : "default"}
                  onClick={openDialog("follow-up")}
                >
                  Log follow-up
                </Button>
                <Button variant="outline" onClick={openDialog("book-demo")}>
                  Book demo
                </Button>
                {isOwner && !convertFirst ? (
                  <Button
                    variant="outline"
                    render={<Link href={`/enquiries/${enquiry.id}/convert`} />}
                  >
                    Convert to Student
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  render={<Link href={`/enquiries/${enquiry.id}/edit`} />}
                >
                  Edit details
                </Button>
                <Button variant="ghost" onClick={openDialog("not-interested")}>
                  Not interested
                </Button>
              </>
            )
          }
        />
        <div className="text-muted-foreground -mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <EnquiryStageBadge
            stage={enquiry.stage}
            followUpDue={enquiry.followUpDue}
          />
          <a
            href={`tel:${enquiry.phone}`}
            className="hover:text-foreground inline-flex items-center gap-1.5 tabular-nums"
          >
            <Phone aria-hidden="true" className="size-3.5" />
            {enquiry.phone}
          </a>
          {enquiry.guardianName != null || enquiry.guardianPhone != null ? (
            <span>
              Parent or Guardian:{" "}
              <span className="text-foreground">
                {[enquiry.guardianName, enquiry.guardianPhone]
                  .filter((value) => value != null)
                  .join(" · ")}
              </span>
            </span>
          ) : null}
          {!closed && !enquiry.followUpDue && enquiry.nextFollowUpOn != null ? (
            <span>
              Next follow-up:{" "}
              <span className="text-foreground">
                {shortDate(enquiry.nextFollowUpOn)}
              </span>
            </span>
          ) : null}
        </div>
        {actionError == null ? null : (
          <p role="alert" className="text-destructive text-sm">
            {actionError}
          </p>
        )}
        <StatusCallout enquiry={enquiry} isOwner={isOwner} today={today} />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card title="Details" className="lg:col-start-2 lg:row-start-1">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <DetailRow label="Interest">
                {interest ?? <Muted>Not decided yet</Muted>}
              </DetailRow>
              <DetailRow label="Preferred Class Mode">
                {preferredClassModeLabel(enquiry.preferredClassMode)}
              </DetailRow>
              <DetailRow label="Preferred timing">
                {enquiry.preferredTiming ?? <Muted>Not given</Muted>}
              </DetailRow>
              <DetailRow label="Source">
                {enquiry.source == null ? (
                  <Muted>Not recorded</Muted>
                ) : (
                  <>
                    {enquiry.source.name}
                    {enquiry.source.retired ? <Muted> (retired)</Muted> : null}
                  </>
                )}
              </DetailRow>
              <DetailRow label="Email">
                {enquiry.email ?? <Muted>Not given</Muted>}
              </DetailRow>
              <DetailRow label="Added">
                {timestampDate(enquiry.createdAt)}
              </DetailRow>
              <div className="sm:col-span-2 lg:col-span-1">
                <DetailRow label="Notes">
                  {enquiry.notes == null ? (
                    <Muted>No notes</Muted>
                  ) : (
                    <span className="whitespace-pre-line">{enquiry.notes}</span>
                  )}
                </DetailRow>
              </div>
            </dl>
          </Card>
          <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
            <Card
              title="Demos"
              action={
                closed ? null : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={openDialog("book-demo")}
                  >
                    Book demo
                  </Button>
                )
              }
            >
              <DemoList demos={enquiry.demos} actions={demoActions} />
            </Card>
            <Card title="History">
              <EnquiryHistory enquiry={enquiry} />
            </Card>
          </div>
        </div>
      </div>
      <FollowUpDialog
        open={dialog === "follow-up"}
        onOpenChange={(open) => {
          setDialog(open ? "follow-up" : null);
        }}
        prospectName={enquiry.prospectName}
        today={today}
        onSubmit={async (input) => {
          await onFollowUp(input);
          setDialog(null);
        }}
      />
      <NotInterestedDialog
        open={dialog === "not-interested"}
        onOpenChange={(open) => {
          setDialog(open ? "not-interested" : null);
        }}
        prospectName={enquiry.prospectName}
        hasBookedDemos={hasBookedDemos}
        onSubmit={async (reason) => {
          await onNotInterested(reason);
          setDialog(null);
        }}
      />
      <BookDemoDialog
        open={dialog === "book-demo"}
        onOpenChange={(open) => {
          setDialog(open ? "book-demo" : null);
        }}
        prospectName={enquiry.prospectName}
        options={options}
        courseId={enquiry.courseId}
        today={today}
        onSubmit={async (input) => {
          await onBookDemo(input);
          setDialog(null);
        }}
      />
    </main>
  );
}
