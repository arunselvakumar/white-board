import type { Metadata } from "next";

import { EditDeliveryNotePage } from "@/components/procurement/delivery-notes/edit-delivery-note-page";

export const metadata: Metadata = { title: "Edit Delivery Note" };

export default async function EditDeliveryNoteRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="w-full p-6">
      <EditDeliveryNotePage noteId={id} />
    </div>
  );
}
