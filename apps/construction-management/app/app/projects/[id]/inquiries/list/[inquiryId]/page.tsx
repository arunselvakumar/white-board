import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { uploadFailedNames } from "@/components/sales/documents/upload-failed";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { InquiryDetail } from "@/components/sales/inquiries/inquiry-detail";

export const metadata: Metadata = { title: "Inquiry" };

/** One inquiry (CM-1003, CM-1004). */
export default async function InquiryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; inquiryId: string }>;
  searchParams: Promise<{ uploadFailed?: string | string[] }>;
}) {
  const { id, inquiryId } = await params;
  const { uploadFailed } = await searchParams;
  if (!(await viewerCan("sales.inquiries", "read", { projectId: id })))
    return <ProjectNoAccess what="Inquiries" />;
  return (
    <InquiryDetail
      projectId={id}
      id={inquiryId}
      uploadFailed={uploadFailedNames(uploadFailed)}
    />
  );
}
