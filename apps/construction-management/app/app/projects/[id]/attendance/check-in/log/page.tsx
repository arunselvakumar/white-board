import type { Metadata } from "next";

import { CheckInLogPage } from "@/app/app/projects/[id]/attendance/check-in/log/_components/check-in-log-page";

export const metadata: Metadata = { title: "Check-In log" };

export default async function ProjectCheckInLogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CheckInLogPage projectId={id} />;
}
