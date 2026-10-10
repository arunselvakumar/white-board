import type { Metadata } from "next";

import { DeliveryNoteDetail } from "@/components/procurement/delivery-notes/delivery-note-detail";

export const metadata: Metadata = { title: "Delivery Note" };

export default async function DeliveryNoteRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="w-full p-6">
      <DeliveryNoteDetail noteId={id} />
    </div>
  );
}
