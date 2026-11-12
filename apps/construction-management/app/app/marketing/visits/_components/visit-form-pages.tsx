"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import { visitPath, visitQuery } from "@/src/queries/marketing-visits";

import { VisitForm } from "./visit-form";

function Frame({
  back,
  title,
  children,
}: {
  back: { label: string; href: string };
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader back={back} title={title} />
        {children}
      </div>
    </div>
  );
}

/**
 * Plan a Visit, or log one already made (completed); Log the visit from a
 * Follow-up fills in its points of contact and visitors.
 */
export function VisitNew({
  status,
  prospectCompanyId,
  contactIds,
  visitorIds,
  canAddFollowUp,
  now,
}: {
  status: "planned" | "completed";
  prospectCompanyId?: string;
  contactIds?: readonly string[];
  visitorIds?: readonly string[];
  /** Follow-ups create: the Next Follow-up section. */
  canAddFollowUp?: boolean;
  now?: Date;
}) {
  return (
    <Frame
      back={{ label: "Visits", href: visitPath() }}
      title={status === "planned" ? "Plan Visit" : "Log Visit"}
    >
      <VisitForm
        mode={{
          kind: "new",
          status,
          prospectCompanyId,
          contactIds,
          visitorIds,
        }}
        canAddFollowUp={canAddFollowUp}
        now={now}
      />
    </Frame>
  );
}

export function VisitEdit({ id, now }: { id: string; now?: Date }) {
  const { data: visit } = useSuspenseQuery(visitQuery(id));
  return (
    <Frame
      back={{ label: visit.number, href: visitPath(visit.id) }}
      title={`Edit ${visit.number}`}
    >
      {visit.actions.canUpdate ? (
        <VisitForm mode={{ kind: "edit", visit }} now={now} />
      ) : (
        <p className="text-muted-foreground text-sm">
          {visit.actions.locked
            ? "This completed Visit is locked: only someone who sees every Visit can change it now. Notes can still be added."
            : "You can see this Visit but not edit it."}
        </p>
      )}
    </Frame>
  );
}

/** A planned (or Missed) Visit, recorded as made. */
export function VisitComplete({
  id,
  canAddFollowUp,
  now,
}: {
  id: string;
  /** Follow-ups create: the Next Follow-up section. */
  canAddFollowUp?: boolean;
  now?: Date;
}) {
  const { data: visit } = useSuspenseQuery(visitQuery(id));
  return (
    <Frame
      back={{ label: visit.number, href: visitPath(visit.id) }}
      title={`Complete ${visit.number}`}
    >
      {visit.actions.canComplete ? (
        <VisitForm
          mode={{ kind: "complete", visit }}
          canAddFollowUp={canAddFollowUp}
          now={now}
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          Only a planned Visit can be completed.
        </p>
      )}
    </Frame>
  );
}
