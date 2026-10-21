import type { Metadata } from "next";

import { DeliveryNoteForm } from "@/components/procurement/delivery-notes/delivery-note-form";
import { DeliveryNoteFormSkeleton } from "@/components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Create Delivery Note" };

/** Create Delivery Note from a Material Request (Delivery Note create). */
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
