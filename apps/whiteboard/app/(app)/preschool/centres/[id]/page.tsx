import type { Metadata } from "next";

import { CentreDetailScreen } from "@/app/(app)/preschool/centres/[id]/_components/centre-detail-screen";

export const metadata: Metadata = { title: "Centre" };

export default async function CentrePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CentreDetailScreen centreId={id} />;
}
