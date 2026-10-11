import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { HindranceNew } from "@/components/site-work/hindrances/hindrance-pages";

export const metadata: Metadata = { title: "Record hindrance" };

type Query = {
  cause?: string | string[];
  date?: string | string[];
  equipmentUsageSheetId?: string | string[];
  activity?: string | string[];
};

const one = (value: string | string[] | undefined): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

/**
 * Record a hindrance (CM-607). A usage sheet's **Record hindrance** link
 * prefills it: `?cause=equipment_breakdown&date=YYYY-MM-DD
 * &equipmentUsageSheetId=<id>&activity=<text>`.
 */
export default async function HindranceNewRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Query>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!(await viewerCan("site_work.hindrances", "create", { projectId: id })))
    return <ProjectNoAccess what="recording hindrances" />;
  const sheet = one(query.equipmentUsageSheetId);
  return (
    <HindranceNew
      projectId={id}
      prefill={{
        cause: one(query.cause),
        date: one(query.date),
        equipmentUsageSheetId:
          sheet != null && /^[0-9a-f-]{36}$/i.test(sheet) ? sheet : undefined,
        activity: one(query.activity),
      }}
    />
  );
}
