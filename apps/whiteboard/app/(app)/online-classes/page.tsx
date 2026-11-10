import type { Metadata } from "next";

import { OnlineClassesScreen } from "@/app/(app)/online-classes/_components/online-classes-screen";

export const metadata: Metadata = { title: "Online Classes" };

export default function OnlineClassesPage() {
  return <OnlineClassesScreen />;
}
