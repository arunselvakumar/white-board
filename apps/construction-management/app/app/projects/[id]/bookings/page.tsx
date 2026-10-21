import { redirect } from "next/navigation";

import { bookingsModulePath } from "@/src/queries/sales-units";

/** The Bookings module opens on its Units chart. */
export default async function BookingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(bookingsModulePath(id, "units"));
}
