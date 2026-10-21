import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { BookingNew } from "@/components/sales/bookings/booking-pages";

export const metadata: Metadata = { title: "New booking" };

/** Hold or Book a unit (CM-1006); `?unitId=&status=` come from the unit panel. */
export default async function BookingNewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ unitId?: string; status?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!(await viewerCan("sales.bookings", "create", { projectId: id })))
    return <ProjectNoAccess what="adding bookings" />;
  return (
    <BookingNew
      projectId={id}
      unitId={query.unitId ?? null}
      status={query.status === "booked" ? "booked" : "on_hold"}
    />
  );
}
