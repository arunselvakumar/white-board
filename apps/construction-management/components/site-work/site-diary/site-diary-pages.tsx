"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/app-shell/page-header";
import { siteDiaryPath, siteDiaryQuery } from "@/src/queries/site-diary";

import { SiteDiaryForm } from "./site-diary-form";
import { formatLongDate } from "./site-diary-parts";

/** New Site Diary for a date (CM-607). */
export function SiteDiaryNew({
  projectId,
  date,
}: {
  projectId: string;
  /** From `?date=`; the form uses today when missing. */
  date?: string;
}) {
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <PageHeader
        back={{ label: "Site Diary", href: siteDiaryPath(projectId, date) }}
        title="Write the diary"
      />
      <SiteDiaryForm projectId={projectId} date={date} />
    </div>
  );
}

/** Edit a Site Diary (CM-607). */
export function SiteDiaryEdit({
  projectId,
  diaryId,
}: {
  projectId: string;
  diaryId: string;
}) {
  const { data } = useSuspenseQuery(siteDiaryQuery(diaryId));
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <PageHeader
        back={{
          label: "Site Diary",
          href: siteDiaryPath(projectId, data.diaryDate),
        }}
        title="Edit Site Diary"
        meta={formatLongDate(data.diaryDate)}
      />
      <SiteDiaryForm projectId={projectId} diary={data} />
    </div>
  );
}
