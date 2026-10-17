import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { InquiryNew } from "@/components/sales/inquiries/inquiry-pages";

export const metadata: Metadata = { title: "Add Inquiry" };

/** Add an inquiry with the full form (CM-1003). */
export default async function InquiryNewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("sales.inquiries", "create", { projectId: id })))
    return <ProjectNoAccess what="adding inquiries" />;
  return <InquiryNew projectId={id} />;
}
