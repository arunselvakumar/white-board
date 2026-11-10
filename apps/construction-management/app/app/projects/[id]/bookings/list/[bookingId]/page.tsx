import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { uploadFailedNames } from "@/app/app/projects/[id]/_components/sales/documents/upload-failed";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { BookingDetail } from "@/app/app/projects/[id]/bookings/list/[bookingId]/_components/booking-detail";
import { QuerySuspense } from "@/components/query-suspense";
import { BookingDetailSkeleton } from "@/app/app/projects/[id]/bookings/list/_components/bookings-skeletons";

export const metadata: Metadata = { title: "Booking" };

/** One booking with its history. */
export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; bookingId: string }>;
  searchParams: Promise<{ uploadFailed?: string | string[] }>;
}) {
  const { id, bookingId } = await params;
  const { uploadFailed } = await searchParams;
  if (!(await viewerCan("sales.bookings", "read", { projectId: id })))
    return <ProjectNoAccess what="Bookings" />;
  return (
    <QuerySuspense fallback={<BookingDetailSkeleton projectId={id} />}>
      <BookingDetail
        projectId={id}
        id={bookingId}
        uploadFailed={uploadFailedNames(uploadFailed)}
      />
    </QuerySuspense>
  );
}
