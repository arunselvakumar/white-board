import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { InquiryEdit } from "@/components/sales/inquiries/inquiry-pages";

export const metadata: Metadata = { title: "Edit Inquiry" };

/** Edit an inquiry (CM-1003). */
export default async function InquiryEditPage({
  params,
}: {
  params: Promise<{ id: string; inquiryId: string }>;
}) {
  const { id, inquiryId } = await params;
  if (!(await viewerCan("sales.inquiries", "update", { projectId: id })))
    return <ProjectNoAccess what="editing inquiries" />;
  return <InquiryEdit projectId={id} inquiryId={inquiryId} />;
}
