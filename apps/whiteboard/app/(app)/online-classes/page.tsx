import type { Metadata } from "next";

import { OnlineClassesScreen } from "@/components/online-classes/online-classes-screen";

export const metadata: Metadata = { title: "Online Classes" };

export default function OnlineClassesPage() {
  return <OnlineClassesScreen />;
}
