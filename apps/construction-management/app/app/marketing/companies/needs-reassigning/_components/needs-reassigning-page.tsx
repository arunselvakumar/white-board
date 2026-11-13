"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { UserRoundCheck } from "lucide-react";
import Link from "next/link";
import { Suspense, useState, type ReactNode } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import { companyPath } from "@/src/queries/marketing-companies";
import { followUpQuery } from "@/src/queries/marketing-follow-ups";
import {
  needsReassigningQuery,
  type NeedsReassigning,
} from "@/src/queries/marketing-team";

import { FollowUpDialog } from "../../../follow-ups/_components/follow-up-dialog";
import {
  dayWords,
  FollowUpTypeBadge,
} from "../../../follow-ups/_components/follow-up-parts";
import { StageBadge } from "../../_components/company-parts";
import {
  ReassignDialog,
  type ReassignTarget,
} from "../../_components/reassign-dialog";

type NeedsCompany = NeedsReassigning["companies"][number];
type NeedsFollowUp = NeedsReassigning["followUps"][number];

function Section({
  id,
  title,
  count,
  empty,
  children,
}: {
  id: string;
  title: string;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="bg-card min-w-0 space-y-3 rounded-xl border p-4 sm:p-5"
    >
      <h2 id={id} className="flex items-center gap-2 font-semibold">
        {title}
        <span className="bg-muted text-muted-foreground rounded-full px-2 text-xs font-medium tabular-nums">
          {count}
        </span>
      </h2>
      {count === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        children
      )}
    </section>
  );
}

function CompanyRow({
  company,
  onReassign,
}: {
  company: NeedsCompany;
  onReassign: () => void;
}) {
  return (
    <li className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 space-y-0.5">
        <p className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            href={companyPath(company.id)}
            className="font-medium break-words hover:underline"
          >
            {company.name}
          </Link>
          <StageBadge stage={company.stage} />
        </p>
        <p className="text-muted-foreground text-sm">
          {[company.city, `Assigned to ${company.assignedTo.name}`]
            .filter((part): part is string => part != null)
            .join(" · ")}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={`Reassign ${company.name}`}
        onClick={onReassign}
      >
        Reassign
      </Button>
    </li>
  );
}

function FollowUpRow({
  followUp,
  canChangeOwner,
  onChangeOwner,
}: {
  followUp: NeedsFollowUp;
  canChangeOwner: boolean;
  onChangeOwner: () => void;
}) {
  return (
    <li className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 space-y-0.5">
        <p className="flex min-w-0 flex-wrap items-center gap-2">
          <FollowUpTypeBadge type={followUp.type} />
          <Link
            href={companyPath(followUp.prospectCompany.id)}
            className="font-medium break-words hover:underline"
          >
            {followUp.prospectCompany.name}
          </Link>
        </p>
        <p className="text-muted-foreground text-sm">
          {`Due ${dayWords(followUp.dueDate)} · Owner ${followUp.owner.name}`}
        </p>
      </div>
      {canChangeOwner && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Change owner of the ${followUp.prospectCompany.name} Follow-up due ${dayWords(followUp.dueDate)}`}
          onClick={onChangeOwner}
        >
          Change owner
        </Button>
      )}
    </li>
  );
}

/** The Follow-up's Edit dialog, once the Follow-up is read. */
function EditFollowUp({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: followUp } = useSuspenseQuery(followUpQuery(id));
  return (
    <FollowUpDialog
      followUp={followUp}
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    />
  );
}

/**
 * Prospect Companies and open Follow-ups whose person is no longer an
 * active Marketing Person (PRD §3.2), for Companies transfer: Reassign a
 * company (its open Follow-ups move with it), or give a Follow-up another
 * owner on its Edit dialog.
 */
export function NeedsReassigningPage({
  canChangeOwner,
}: {
  /** Follow-ups update: Change owner opens the Follow-up's Edit dialog. */
  canChangeOwner: boolean;
}) {
  const { data } = useSuspenseQuery(needsReassigningQuery);
  const [reassigning, setReassigning] = useState<ReassignTarget | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const none = data.companies.length === 0 && data.followUps.length === 0;

  return (
    <div className="w-full p-6">
      <div className="flex w-full max-w-4xl min-w-0 flex-col gap-6">
        <PageHeader
          back={{ label: "Prospect Companies", href: companyPath() }}
          title="Needs reassigning"
          meta="Companies and open Follow-ups of people who are no longer active Marketing People."
        />
        {none ? (
          <Empty className="bg-card border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UserRoundCheck />
              </EmptyMedia>
              <EmptyTitle>Nothing needs reassigning</EmptyTitle>
              <EmptyDescription>
                When a Marketing Person leaves, their Prospect Companies and
                open Follow-ups show here for someone else to take over.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <Section
              id="needs-reassigning-companies"
              title="Prospect Companies"
              count={data.companies.length}
              empty="Every company has an active Marketing Person."
            >
              <ul aria-label="Prospect Companies" className="divide-y">
                {data.companies.map((company) => (
                  <CompanyRow
                    key={company.id}
                    company={company}
                    onReassign={() => {
                      setReassigning(company);
                    }}
                  />
                ))}
              </ul>
            </Section>
            <Section
              id="needs-reassigning-follow-ups"
              title="Open Follow-ups"
              count={data.followUps.length}
              empty="Every open Follow-up has an active owner."
            >
              <ul aria-label="Open Follow-ups" className="divide-y">
                {data.followUps.map((followUp) => (
                  <FollowUpRow
                    key={followUp.id}
                    followUp={followUp}
                    canChangeOwner={canChangeOwner}
                    onChangeOwner={() => {
                      setEditing(followUp.id);
                    }}
                  />
                ))}
              </ul>
            </Section>
          </>
        )}
      </div>
      {reassigning != null && (
        <ReassignDialog
          company={reassigning}
          open
          onOpenChange={(open) => {
            if (!open) setReassigning(null);
          }}
        />
      )}
      {editing != null && (
        <Suspense fallback={null}>
          <EditFollowUp
            id={editing}
            onClose={() => {
              setEditing(null);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
