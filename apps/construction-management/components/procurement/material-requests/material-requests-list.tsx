"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import {
  formatDate,
  MaterialRequestStatusBadge,
} from "@/components/procurement/stores/central-store-parts";
import {
  materialRequestsQuery,
  type MaterialRequest,
} from "@/src/queries/material-requests";

type Cursor = { after?: string; before?: string };

function RequestRow({
  request,
  href,
  showProject,
}: {
  request: MaterialRequest;
  href: string;
  showProject: boolean;
}) {
  const items = request.items.length;
  return (
    <li className="hover:bg-muted/40 relative flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
      <Link
        href={href}
        className="focus-visible:ring-ring min-w-0 flex-1 rounded-sm outline-none after:absolute after:inset-0 focus-visible:ring-2"
      >
        <span className="block truncate text-sm font-medium">
          {request.number}
        </span>
        <span className="text-muted-foreground block truncate text-xs">
          {[
            formatDate(request.requestDate),
            showProject ? request.projectName : `To ${request.storeName ?? "store"}`,
            items === 1 ? "1 material" : `${String(items)} materials`,
          ]
            .filter((part) => part != null)
            .join(" · ")}
        </span>
      </Link>
      <MaterialRequestStatusBadge status={request.status} />
    </li>
  );
}

/**
 * Material Requests, newest first: a Project's (`projectId`) or a
 * store's (`storeId`), 25 to a page.
 */
export function MaterialRequestsList({
  projectId,
  storeId,
  hrefFor,
  createHref,
}: {
  projectId?: string;
  storeId?: string;
  hrefFor: (request: MaterialRequest) => string;
  /** Shown as "Raise request" when the viewer may raise one. */
  createHref?: string | null;
}) {
  const [cursor, setCursor] = useState<Cursor>({});
  const { data } = useSuspenseQuery(
    materialRequestsQuery({ projectId, storeId, cursor }),
  );
  const add =
    createHref == null ? null : (
      <Link href={createHref} className={buttonVariants()}>
        <Plus aria-hidden="true" />
        Raise request
      </Link>
    );
  if (data.total === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ClipboardList />
          </EmptyMedia>
          <EmptyTitle>No Material Requests</EmptyTitle>
          <EmptyDescription>
            {storeId != null
              ? "Requests the Projects raise to this store show here."
              : "Ask a Central Store for materials; its Delivery Notes bring them to site."}
          </EmptyDescription>
        </EmptyHeader>
        {add == null ? null : <EmptyContent>{add}</EmptyContent>}
      </Empty>
    );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm tabular-nums">
          {data.total === 1 ? "1 request" : `${String(data.total)} requests`}
        </p>
        {add}
      </div>
      <ul
        aria-label="Material Requests"
        className="bg-card divide-y rounded-xl border"
      >
        {data.items.map((request) => (
          <RequestRow
            key={request.id}
            request={request}
            href={hrefFor(request)}
            showProject={projectId == null}
          />
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
