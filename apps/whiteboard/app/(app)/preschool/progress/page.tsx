import type { Metadata } from "next";

import { ProgressScreen } from "@/app/(app)/preschool/progress/_components/progress-screen";

export const metadata: Metadata = { title: "Progress" };

export default function Page() {
  return <ProgressScreen />;
}
