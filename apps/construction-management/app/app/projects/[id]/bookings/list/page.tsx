import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { BookingsList } from "@/components/sales/bookings/bookings-list";

export const metadata: Metadata = { title: "Bookings" };

/** Bookings → Bookings: the Project's bookings (CM-1006). */
export default async function BookingsListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("sales.bookings", "read", { projectId: id })))
    return <ProjectNoAccess what="Bookings" />;
  return <BookingsList projectId={id} />;
}
