import type { Metadata } from "next";

import { DeliveryNoteDetail } from "@/app/app/workspace/central-store/delivery-notes/[id]/_components/delivery-note-detail";
import { DeliveryNoteDetailSkeleton } from "@/app/app/_components/procurement/procurement-skeletons";
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
