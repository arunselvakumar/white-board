import type { Metadata } from "next";
import { Suspense } from "react";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { InquiriesList } from "@/components/sales/inquiries/inquiries-list";
import { InquiriesListSkeleton } from "@/components/sales/inquiries/inquiries-skeletons";

export const metadata: Metadata = { title: "Inquiries" };

/** The Project's inquiries (CM-1003). */
export default async function InquiriesListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("sales.inquiries", "read", { projectId: id })))
    return <ProjectNoAccess what="Inquiries" />;
  // The list reads `?due=` (a notification's Overdue link).
  return (
    <Suspense fallback={<InquiriesListSkeleton />}>
      <InquiriesList projectId={id} />
    </Suspense>
  );
}
