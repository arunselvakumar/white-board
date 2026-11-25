import type { Metadata } from "next";

import { StaffScreen } from "@/app/(app)/preschool/staff/_components/staff-screen";

export const metadata: Metadata = { title: "Staff" };

export default function StaffPage() {
  return <StaffScreen />;
}
