import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { uploadFailedNames } from "@/components/sales/documents/upload-failed";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { BookingDetail } from "@/components/sales/bookings/booking-detail";

export const metadata: Metadata = { title: "Booking" };

/** One booking with its history (CM-1006). */
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
    <BookingDetail
      projectId={id}
      id={bookingId}
      uploadFailed={uploadFailedNames(uploadFailed)}
    />
  );
}
