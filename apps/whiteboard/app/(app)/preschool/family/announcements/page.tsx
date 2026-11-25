import type { Metadata } from "next";

import { FamilyAnnouncementsScreen } from "@/app/(app)/preschool/family/announcements/_components/family-announcements-screen";

export const metadata: Metadata = { title: "Announcements" };

export default function FamilyAnnouncementsPage() {
  return <FamilyAnnouncementsScreen />;
}
