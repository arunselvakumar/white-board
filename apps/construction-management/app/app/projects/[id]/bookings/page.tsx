import { redirect } from "next/navigation";

import { pageHref } from "@/lib/page-href";

/** The Bookings module opens on its Units chart. */
export default async function BookingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(pageHref("/app/projects/[id]/bookings/units", { id }));
}
