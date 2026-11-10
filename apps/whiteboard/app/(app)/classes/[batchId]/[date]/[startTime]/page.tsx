import type { Metadata } from "next";

import { ClassPrejoinScreen } from "@/app/(app)/classes/[batchId]/[date]/[startTime]/_components/class-prejoin-screen";

export const metadata: Metadata = { title: "Join class" };

export default async function ClassPage({
  params,
}: {
  params: Promise<{ batchId: string; date: string; startTime: string }>;
}) {
  return <ClassPrejoinScreen {...await params} />;
}
