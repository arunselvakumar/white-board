"use client";

import { Suspense } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";

import { SiteRecordHeader } from "@/app/app/projects/[id]/_components/site-work/site-record-header";
import { hindranceQuery, hindrancesPath } from "@/src/queries/hindrances";

import { HindranceForm, type HindrancePrefill } from "./hindrance-form";
import { HindranceFormFieldsSkeleton } from "@/app/app/_components/site-work/site-work-skeletons";

/** Record a hindrance; a usage sheet's link prefills it. */
export function HindranceNew({
  projectId,
  prefill,
}: {
  projectId: string;
  prefill: HindrancePrefill;
}) {
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <SiteRecordHeader
        back={{ label: "Hindrances", href: hindrancesPath(projectId) }}
        title="Record hindrance"
      />
      <Suspense fallback={<HindranceFormFieldsSkeleton />}>
        <HindranceForm projectId={projectId} prefill={prefill} />
      </Suspense>
    </div>
  );
}

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
      <SiteRecordHeader
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
