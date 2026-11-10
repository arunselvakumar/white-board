import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { SalesSettingsPage } from "@/app/app/projects/[id]/inquiries/settings/_components/sales-settings";

export const metadata: Metadata = { title: "Inquiry settings" };

/** Funnel Stages, Lead Sources and Lost Reasons. */
export default async function InquirySettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("sales.inquiries", "read", { projectId: id })))
    return <ProjectNoAccess what="Inquiries" />;
  return <SalesSettingsPage projectId={id} />;
}
