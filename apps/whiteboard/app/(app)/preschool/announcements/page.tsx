import type { Metadata } from "next";

import { AnnouncementsScreen } from "@/app/(app)/preschool/announcements/_components/announcements-screen";

export const metadata: Metadata = { title: "Announcements" };

export default function Page() {
  return <AnnouncementsScreen />;
}
