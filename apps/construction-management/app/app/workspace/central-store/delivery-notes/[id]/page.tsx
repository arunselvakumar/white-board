import type { Metadata } from "next";

import { DeliveryNoteDetail } from "@/components/procurement/delivery-notes/delivery-note-detail";
import { DeliveryNoteDetailSkeleton } from "@/components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Delivery Note" };

export default async function DeliveryNoteRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="w-full p-6">
      <QuerySuspense fallback={<DeliveryNoteDetailSkeleton />}>
        <DeliveryNoteDetail noteId={id} />
      </QuerySuspense>
    </div>
  );
}
