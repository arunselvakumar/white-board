import type { Metadata } from "next";

import { MaterialRequestDetail } from "@/components/procurement/material-requests/material-request-detail";

export const metadata: Metadata = { title: "Material Request" };

/** A Material Request seen from the store side. */
export default async function StoreMaterialRequestRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="w-full p-6">
      <MaterialRequestDetail requestId={id} side="store" />
    </div>
  );
}
