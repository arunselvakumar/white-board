import type { Metadata } from "next";

import { ChildFeeAccountScreen } from "@/app/(app)/preschool/fees/children/[childId]/_components/child-fee-account-screen";

export const metadata: Metadata = { title: "Fee account" };

export default async function ChildFeeAccountPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  return <ChildFeeAccountScreen childId={childId} />;
}
