"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/app-shell/page-header";
import { hindranceQuery, hindrancesPath } from "@/src/queries/hindrances";

import { HindranceForm, type HindrancePrefill } from "./hindrance-form";

/** Record a hindrance; a usage sheet's link prefills it (CM-607). */
export function HindranceNew({
  projectId,
  prefill,
}: {
  projectId: string;
  prefill: HindrancePrefill;
}) {
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <PageHeader
        back={{ label: "Hindrances", href: hindrancesPath(projectId) }}
        title="Record hindrance"
      />
      <HindranceForm projectId={projectId} prefill={prefill} />
    </div>
  );
}

/** Edit a hindrance (CM-607). */
export function HindranceEdit({
  projectId,
  hindranceId,
}: {
  projectId: string;
  hindranceId: string;
}) {
  const { data } = useSuspenseQuery(hindranceQuery(hindranceId));
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <PageHeader
        back={{
          label: data.number,
          href: hindrancesPath(projectId, hindranceId),
        }}
        title={`Edit ${data.number}`}
      />
      <HindranceForm projectId={projectId} hindrance={data} />
    </div>
  );
}
