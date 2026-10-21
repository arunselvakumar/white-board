import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { SalesSettingsPage } from "@/components/sales/settings/sales-settings";

export const metadata: Metadata = { title: "Inquiry settings" };

/** Inquiries → Settings: Funnel Stages, Lead Sources, Lost Reasons (CM-1002). */
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
