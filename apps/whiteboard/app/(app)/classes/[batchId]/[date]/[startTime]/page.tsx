import type { Metadata } from "next";

import { ClassPrejoinScreen } from "@/components/classes/class-prejoin-screen";

export const metadata: Metadata = { title: "Join class" };

export default async function ClassPage({ params }: { params: Promise<{ batchId: string; date: string; startTime: string }> }) {
  return <ClassPrejoinScreen {...await params} />;
}
