import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { BookingEdit } from "@/components/sales/bookings/booking-pages";
import { QuerySuspense } from "@/components/query-suspense";
import { BookingEditSkeleton } from "@/components/sales/bookings/bookings-skeletons";

export const metadata: Metadata = { title: "Edit booking" };

export default async function BookingEditPage({
  params,
}: {
  params: Promise<{ id: string; bookingId: string }>;
}) {
  const { id, bookingId } = await params;
  if (!(await viewerCan("sales.bookings", "update", { projectId: id })))
    return <ProjectNoAccess what="editing bookings" />;
  return (
    <QuerySuspense
      fallback={<BookingEditSkeleton projectId={id} bookingId={bookingId} />}
    >
      <BookingEdit projectId={id} bookingId={bookingId} />
    </QuerySuspense>
  );
}
