import type { Metadata } from "next";

import { RolesNoAccess } from "@/app/app/staff/_components/roles-no-access";
import { EditSiteEngineer } from "@/app/app/staff/site-engineers/[id]/_components/edit-site-engineer";
import { SiteEngineerFormSkeleton } from "@/app/app/staff/site-engineers/_components/site-engineers-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

import { viewerFlags } from "../../../_lib/viewer-can";

export const metadata: Metadata = { title: "Edit Site Engineer" };

/** Site Engineers are on the Labours menu (ADR CM-0037). */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const can = await viewerFlags("masters.labours", ["read", "financial"]);
  if (!can.read) return <RolesNoAccess what="Site Engineers" />;
  return (
    <QuerySuspense fallback={<SiteEngineerFormSkeleton />}>
      <EditSiteEngineer id={id} canSeeSalary={can.financial} />
    </QuerySuspense>
  );
}
