import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { uploadFailedNames } from "@/app/app/projects/[id]/_components/sales/documents/upload-failed";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { InquiryDetail } from "@/app/app/projects/[id]/inquiries/list/[inquiryId]/_components/inquiry-detail";
import { QuerySuspense } from "@/components/query-suspense";
import { InquiryDetailSkeleton } from "@/app/app/projects/[id]/inquiries/list/_components/inquiries-skeletons";

export const metadata: Metadata = { title: "Inquiry" };

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
    <QuerySuspense fallback={<InquiryDetailSkeleton projectId={id} />}>
      <InquiryDetail
        projectId={id}
        id={inquiryId}
        uploadFailed={uploadFailedNames(uploadFailed)}
      />
    </QuerySuspense>
  );
}
