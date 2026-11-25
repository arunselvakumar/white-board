"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Check, Pencil } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { cn } from "@repo/ui/lib/utils";

import { FormAlert } from "@/components/auth/form-alert";
import { PhoneLinks } from "@/app/(app)/preschool/_components/phone-links";
import {
  formatDate,
  formatDateTime,
} from "@/app/(app)/preschool/_components/preschool-format";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import {
  EnquiryActionDialog,
  useEnquiryMoves,
  type EnquiryAction,
} from "@/app/(app)/preschool/enquiries/_components/enquiry-actions";
import {
  admitHref,
  FollowUpDate,
} from "@/app/(app)/preschool/enquiries/_components/enquiry-card";
import {
  PRESCHOOL_ENQUIRY_SOURCE_LABELS,
  PRESCHOOL_ENQUIRY_STATUS_LABELS,
  preschoolEnquiryQueryOptions,
  type PreschoolEnquiryActivity,
  type PreschoolEnquiryDetail,
  type PreschoolEnquiryStatus,
} from "@/src/queries/preschool/enquiries";

const STEPS = [
  "new",
  "contacted",
  "visit_scheduled",
  "visited",
  "admitted",
] as const satisfies readonly PreschoolEnquiryStatus[];

const GENDER_LABEL = { girl: "Girl", boy: "Boy", other: "Other" } as const;

const ACTIVITY_LABEL = {
  note: "Note",
  call: "Call",
  visit: "Visit",
  status_change: "Status",
} as const;

function Stepper({ status }: { status: PreschoolEnquiryStatus }) {
  const reached = STEPS.indexOf(status as (typeof STEPS)[number]);
  return (
    <ol aria-label="Pipeline" className="flex flex-wrap gap-2">
      {STEPS.map((step, index) => {
        const current = step === status;
        const done = reached >= 0 && index < reached;
        return (
          <li
            key={step}
            aria-current={current ? "step" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
              current && "border-primary bg-primary text-primary-foreground",
              done && "text-foreground",
              !current && !done && "text-muted-foreground",
            )}
          >
            {done ? <Check className="size-3" aria-hidden="true" /> : null}
            {PRESCHOOL_ENQUIRY_STATUS_LABELS[step]}
          </li>
        );
      })}
    </ol>
  );
}

function Facts({ facts }: { facts: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      {facts.map(([label, value]) => (
        <div key={label} className="min-w-0 space-y-0.5">
          <dt className="text-muted-foreground text-xs">{label}</dt>
          <dd className="break-words">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function Timeline({ items }: { items: PreschoolEnquiryActivity[] }) {
  return (
    <ol className="space-y-4">
      {items.map((item) => (
        <li key={item.id} className="border-l-2 pl-3 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{ACTIVITY_LABEL[item.kind]}</Badge>
            {item.toStatus == null ? null : (
              <span className="font-medium">
                {PRESCHOOL_ENQUIRY_STATUS_LABELS[item.toStatus]}
              </span>
            )}
          </p>
          {item.note == null ? null : (
            <p className="mt-1 whitespace-pre-line">{item.note}</p>
          )}
          <p className="text-muted-foreground mt-1 text-xs">
            {item.createdByName} · {formatDateTime(item.createdAt)}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** One Enquiry: details, the pipeline, its actions and its history. */
export function EnquiryDetail({
  enquiry,
}: {
  enquiry: PreschoolEnquiryDetail;
}) {
  const [action, setAction] = useState<EnquiryAction | null>(null);
  const moves = useEnquiryMoves();
  const { status } = enquiry;
  const open = status !== "admitted" && status !== "lost";
  return (
    <PreschoolPage
      title={enquiry.childName}
      watermark="Enquiries"
      meta={PRESCHOOL_ENQUIRY_STATUS_LABELS[status]}
      back={{ href: "/preschool/enquiries", label: "Enquiries" }}
      actions={
        <div className="flex flex-wrap gap-2">
          {status === "admitted" ? null : (
            <Link
              href={`/preschool/enquiries/${enquiry.id}/edit`}
              className={buttonVariants({ variant: "outline" })}
            >
              <Pencil aria-hidden="true" />
              Edit
            </Link>
          )}
          {open ? (
            <Link href={admitHref(enquiry.id)} className={buttonVariants()}>
              Admit
            </Link>
          ) : null}
        </div>
      }
    >
      <Stepper status={status} />
      {status === "lost" ? (
        <Alert variant="destructive">
          <AlertTitle>Lost</AlertTitle>
          <AlertDescription>{enquiry.lostReason}</AlertDescription>
          <AlertAction>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={moves.reopen.isPending}
              onClick={() => {
                moves.reopen.mutate(enquiry.id);
              }}
            >
              Reopen
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
      {status === "admitted" && enquiry.convertedChildId != null ? (
        <Alert>
          <AlertTitle>Admitted</AlertTitle>
          <AlertDescription>
            <Link
              href={`/preschool/children/${enquiry.convertedChildId}`}
              className="underline underline-offset-4"
            >
              Open the Child&apos;s record
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
      <FormAlert message={moves.error} />
      {open ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => {
              setAction({ kind: "follow-up", enquiry });
            }}
          >
            Log follow-up
          </Button>
          {status === "new" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                moves.move.mutate({ id: enquiry.id, status: "contacted" });
              }}
            >
              Mark contacted
            </Button>
          ) : null}
          {status !== "visited" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAction({ kind: "schedule-visit", enquiry });
              }}
            >
              {status === "visit_scheduled"
                ? "Change visit date"
                : "Schedule visit"}
            </Button>
          ) : null}
          {status === "contacted" || status === "visit_scheduled" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                moves.move.mutate({ id: enquiry.id, status: "visited" });
              }}
            >
              Mark visited
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              setAction({ kind: "lost", enquiry });
            }}
          >
            Mark lost
          </Button>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Details</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Facts
              facts={[
                [
                  "Child",
                  [
                    enquiry.childName,
                    enquiry.childAgeText,
                    enquiry.childGender == null
                      ? null
                      : GENDER_LABEL[enquiry.childGender],
                  ]
                    .filter((part) => part != null)
                    .join(" · "),
                ],
                [
                  "Date of birth",
                  enquiry.childDateOfBirth == null
                    ? null
                    : formatDate(enquiry.childDateOfBirth),
                ],
                ["Parent", enquiry.parentName],
                [
                  "Mobile",
                  <PhoneLinks
                    key="phone"
                    phone={enquiry.parentPhone}
                    label={enquiry.parentName}
                  />,
                ],
                ["Email", enquiry.parentEmail],
                ["Programme", enquiry.programmeName],
                ["Source", PRESCHOOL_ENQUIRY_SOURCE_LABELS[enquiry.source]],
                [
                  "Next follow-up",
                  open ? <FollowUpDate key="due" enquiry={enquiry} /> : null,
                ],
                [
                  "Visit",
                  enquiry.visitOn == null ? null : formatDate(enquiry.visitOn),
                ],
                ["Notes", enquiry.notes],
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Activity</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Timeline items={enquiry.activities} />
          </CardContent>
        </Card>
      </div>
      <EnquiryActionDialog
        action={action}
        onClose={() => {
          setAction(null);
        }}
      />
    </PreschoolPage>
  );
}

export function EnquiryDetailScreen({ enquiryId }: { enquiryId: string }) {
  const { data } = useSuspenseQuery(preschoolEnquiryQueryOptions(enquiryId));
  return <EnquiryDetail enquiry={data} />;
}
