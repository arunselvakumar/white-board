import type { Metadata } from "next";

import { PreschoolEmptyPage } from "@/app/(app)/preschool/_components/preschool-empty-page";

export const metadata: Metadata = { title: "Announcements" };

export default function Page() {
  return <PreschoolEmptyPage href="/preschool/family/announcements" />;
}
