"use client";

import { DotsThreeVerticalIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";

import { PhoneLinks } from "@/app/(app)/preschool/_components/phone-links";
import { formatDate } from "@/app/(app)/preschool/_components/preschool-format";
import {
  PRESCHOOL_ENQUIRY_SOURCE_LABELS,
  type PreschoolEnquiry,
} from "@/src/queries/preschool/enquiries";

import type { EnquiryAction } from "./enquiry-actions";

/** Where an Admission from this Enquiry starts. */
export function admitHref(enquiryId: string): string {
  return `/preschool/children/new?enquiryId=${enquiryId}`;
}

/** "Due" beside a next follow-up that is today or earlier. */
export function FollowUpDate({ enquiry }: { enquiry: PreschoolEnquiry }) {
  if (enquiry.nextFollowUpOn == null)
    return <span className="text-muted-foreground">No follow-up set</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span>Follow up {formatDate(enquiry.nextFollowUpOn)}</span>
      {enquiry.followUpDue ? <Badge variant="destructive">Due</Badge> : null}
    </span>
  );
}

/** The actions an open Enquiry offers, as menu items. */
export function EnquiryMenu({
  enquiry,
  onAction,
  onMove,
}: {
  enquiry: PreschoolEnquiry;
  onAction: (action: EnquiryAction) => void;
  onMove: (status: "contacted" | "visited") => void;
}) {
  const router = useRouter();
  const { status } = enquiry;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Actions for ${enquiry.childName}`}
          />
        }
      >
        <DotsThreeVerticalIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {status === "new" ? (
          <DropdownMenuItem
            onClick={() => {
              onMove("contacted");
            }}
          >
            Mark contacted
          </DropdownMenuItem>
        ) : null}
        {status !== "visited" ? (
          <DropdownMenuItem
            onClick={() => {
              onAction({ kind: "schedule-visit", enquiry });
            }}
          >
            {status === "visit_scheduled"
              ? "Change visit date"
              : "Schedule visit"}
          </DropdownMenuItem>
        ) : null}
        {status === "contacted" || status === "visit_scheduled" ? (
          <DropdownMenuItem
            onClick={() => {
              onMove("visited");
            }}
          >
            Mark visited
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onClick={() => {
            onAction({ kind: "follow-up", enquiry });
          }}
        >
          Log follow-up
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            router.push(admitHref(enquiry.id));
          }}
        >
          Admit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            onAction({ kind: "lost", enquiry });
          }}
        >
          Mark lost
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** An open Enquiry on the board. */
export function EnquiryCard({
  enquiry,
  onAction,
  onMove,
}: {
  enquiry: PreschoolEnquiry;
  onAction: (action: EnquiryAction) => void;
  onMove: (status: "contacted" | "visited") => void;
}) {
  return (
    <li className="bg-card flex min-w-0 flex-col gap-2 rounded-xl border p-3 text-sm">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/preschool/enquiries/${enquiry.id}`}
            className="block truncate font-semibold underline-offset-4 hover:underline"
          >
            {enquiry.childName}
          </Link>
          <p className="text-muted-foreground text-xs">
            {[enquiry.childAgeText, enquiry.programmeName]
              .filter((part) => part != null)
              .join(" · ") || "Age not known"}
          </p>
        </div>
        <EnquiryMenu enquiry={enquiry} onAction={onAction} onMove={onMove} />
      </div>
      <div className="min-w-0">
        <p className="truncate">{enquiry.parentName}</p>
        <PhoneLinks phone={enquiry.parentPhone} label={enquiry.parentName} />
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
        <FollowUpDate enquiry={enquiry} />
        <span>{PRESCHOOL_ENQUIRY_SOURCE_LABELS[enquiry.source]}</span>
      </div>
      {enquiry.status === "visit_scheduled" && enquiry.visitOn != null ? (
        <p className="text-xs">Visit on {formatDate(enquiry.visitOn)}</p>
      ) : null}
    </li>
  );
}
