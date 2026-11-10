"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { deliveryNoteQuery } from "@/src/queries/delivery-notes";

import { DeliveryNoteForm } from "./delivery-note-form";

/** Edit a pending Delivery Note: the form over the note as loaded. */
export function EditDeliveryNotePage({ noteId }: { noteId: string }) {
  const { data } = useSuspenseQuery(deliveryNoteQuery(noteId));
  return (
    <DeliveryNoteForm
      key={data.updatedAt}
      materialRequestId={data.materialRequestId}
      note={data}
    />
  );
}
