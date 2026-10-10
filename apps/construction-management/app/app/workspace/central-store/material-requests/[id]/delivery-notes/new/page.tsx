import type { Metadata } from "next";

import { DeliveryNoteForm } from "@/components/procurement/delivery-notes/delivery-note-form";

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
      <DeliveryNoteForm materialRequestId={id} />
    </div>
  );
}
