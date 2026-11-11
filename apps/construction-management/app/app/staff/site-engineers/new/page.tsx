import type { Metadata } from "next";

import { RolesNoAccess } from "@/app/app/staff/_components/roles-no-access";
import { AddSiteEngineer } from "@/app/app/staff/site-engineers/new/_components/add-site-engineer";
import { QuerySuspense } from "@/components/query-suspense";

import { viewerFlags } from "../../../_lib/viewer-can";

export const metadata: Metadata = { title: "Add Site Engineer" };

/** Site Engineers are on the Labours menu (ADR CM-0037). */
export default async function Page() {
  const can = await viewerFlags("masters.labours", ["create", "financial"]);
  if (!can.create) return <RolesNoAccess what="adding Site Engineers" />;
  return (
    <QuerySuspense>
      <AddSiteEngineer canSeeSalary={can.financial} />
    </QuerySuspense>
  );
}
