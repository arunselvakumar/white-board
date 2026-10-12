import { getAuth } from "@repo/auth/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AbsenceNoticesScreen } from "@/components/absence-notices/staff/absence-notices-screen";

export const metadata: Metadata = { title: "Absence Notices" };

export default async function AbsenceNoticesPage() {
  const { role } = await getAuth();
  if (role !== "owner") redirect("/");
  return <AbsenceNoticesScreen audience="owner" />;
}
