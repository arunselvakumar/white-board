import type { Metadata } from "next";

import { EditDeliveryNotePage } from "@/components/procurement/delivery-notes/edit-delivery-note-page";
import { DeliveryNoteFormSkeleton } from "@/components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Edit Delivery Note" };

export default async function EditDeliveryNoteRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="w-full p-6">
      <QuerySuspense fallback={<DeliveryNoteFormSkeleton />}>
        <EditDeliveryNotePage noteId={id} />
      </QuerySuspense>
    </div>
  );
}
