import type { Metadata } from "next";

import { CentreRoyaltyStatement } from "@/app/(app)/preschool/head-office/royalty/[centreId]/_components/centre-royalty-statement";

export const metadata: Metadata = { title: "Royalty Statement" };

export default async function CentreRoyaltyPage({
  params,
}: {
  params: Promise<{ centreId: string }>;
}) {
  const { centreId } = await params;
  return <CentreRoyaltyStatement centreId={centreId} />;
}
