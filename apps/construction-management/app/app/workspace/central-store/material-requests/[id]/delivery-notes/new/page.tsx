import type { Metadata } from "next";

import { DeliveryNoteForm } from "@/app/app/workspace/central-store/_components/delivery-note-form";
import { DeliveryNoteFormSkeleton } from "@/app/app/_components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Create Delivery Note" };

/** Create Delivery Note from a Material Request. */
export default async function NewDeliveryNoteRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="w-full p-6">
      <QuerySuspense
        fallback={<DeliveryNoteFormSkeleton title="Create Delivery Note" />}
      >
        <DeliveryNoteForm materialRequestId={id} />
      </QuerySuspense>
    </div>
  );
}
