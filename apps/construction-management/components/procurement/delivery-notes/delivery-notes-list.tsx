"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Truck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import {
  centralStoreHref,
  DeliveryNoteStatusBadge,
  formatDate,
} from "@/components/procurement/stores/central-store-parts";
import { deliveryNotesQuery } from "@/src/queries/delivery-notes";

type Cursor = { after?: string; before?: string };

/** Delivery Notes, newest first, of a store, a Project or a request. */
export function DeliveryNotesList({
  storeId,
  projectId,
  materialRequestId,
}: {
  storeId?: string;
  projectId?: string;
  materialRequestId?: string;
}) {
  const [cursor, setCursor] = useState<Cursor>({});
  const { data } = useSuspenseQuery(
    deliveryNotesQuery({ storeId, projectId, materialRequestId, cursor }),
  );
  if (data.total === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Truck />
          </EmptyMedia>
          <EmptyTitle>No Delivery Notes</EmptyTitle>
          <EmptyDescription>
            The store creates Delivery Notes from Material Requests.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <div className="space-y-3">
      <ul
        aria-label="Delivery Notes"
        className="bg-card divide-y rounded-xl border"
      >
        {data.items.map((note) => (
          <li
            key={note.id}
            className="hover:bg-muted/40 relative flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5"
          >
            <Link
              href={centralStoreHref.note(note.id)}
              className="focus-visible:ring-ring min-w-0 flex-1 rounded-sm outline-none after:absolute after:inset-0 focus-visible:ring-2"
            >
              <span className="block truncate text-sm font-medium">
                {note.number}
              </span>
              <span className="text-muted-foreground block truncate text-xs">
                {[
                  formatDate(note.deliveryDate),
                  note.materialRequestNumber,
                  storeId == null ? note.storeName : note.projectName,
                ]
                  .filter((part) => part != null)
                  .join(" · ")}
              </span>
            </Link>
            <DeliveryNoteStatusBadge status={note.status} />
          </li>
        ))}
      </ul>
      {data.prevCursor != null || data.nextCursor != null ? (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.prevCursor == null}
            onClick={() => {
              setCursor({ before: data.prevCursor ?? undefined });
            }}
          >
            Newer
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={data.nextCursor == null}
            onClick={() => {
              setCursor({ after: data.nextCursor ?? undefined });
            }}
          >
            Older
          </Button>
        </div>
      ) : null}
    </div>
  );
}
