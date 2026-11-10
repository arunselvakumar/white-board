import type { Metadata } from "next";

import { BatchTestsScreen } from "@/app/(app)/_components/class-tests/staff/batch-tests-screen";

export const metadata: Metadata = { title: "Tests" };

export default async function BatchTestsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BatchTestsScreen batchId={id} basePath={`/batches/${id}/tests`} />;
}
