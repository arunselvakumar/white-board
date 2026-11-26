import type { Metadata } from "next";

import { ChildrenScreen } from "@/app/(app)/preschool/children/_components/children-screen";

export const metadata: Metadata = { title: "Children" };

export default function Page() {
  return <ChildrenScreen />;
}
