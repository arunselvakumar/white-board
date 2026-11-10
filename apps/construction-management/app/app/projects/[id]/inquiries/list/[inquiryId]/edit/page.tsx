import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { InquiryEdit } from "@/app/app/projects/[id]/inquiries/list/_components/inquiry-pages";
import { QuerySuspense } from "@/components/query-suspense";
import { InquiryEditSkeleton } from "@/app/app/projects/[id]/inquiries/list/_components/inquiries-skeletons";

export const metadata: Metadata = { title: "Edit Inquiry" };

export default async function InquiryEditPage({
  params,
}: {
  params: Promise<{ id: string; inquiryId: string }>;
}) {
  const { id, inquiryId } = await params;
  if (!(await viewerCan("sales.inquiries", "update", { projectId: id })))
    return <ProjectNoAccess what="editing inquiries" />;
  return (
    <QuerySuspense
      fallback={<InquiryEditSkeleton projectId={id} inquiryId={inquiryId} />}
    >
      <InquiryEdit projectId={id} inquiryId={inquiryId} />
    </QuerySuspense>
  );
}
