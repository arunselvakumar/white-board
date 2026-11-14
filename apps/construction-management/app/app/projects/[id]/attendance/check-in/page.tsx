import type { Metadata } from "next";

import { CheckInFindPage } from "@/app/app/projects/[id]/attendance/check-in/_components/check-in-find-page";

export const metadata: Metadata = { title: "Check-In" };

export default async function ProjectCheckInPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CheckInFindPage projectId={id} />;
}
