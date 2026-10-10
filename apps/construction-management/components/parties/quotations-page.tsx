"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, Search } from "lucide-react";
import Link from "next/link";
import { Suspense, useDeferredValue, useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/ui/components/input-group";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { PageHeader } from "@/components/app-shell/page-header";
import { DocumentFileIcon } from "@/components/projects/documents/document-file-icon";
import { formatBytes } from "@/lib/project-documents";
import {
  quotationsQuery,
  type Quotation,
  type QuotationsFilter,
} from "@/src/queries/quotations";

import { quotationOpenUrl } from "./party-quotations";
import { PARTY_SCREENS, partyEditPath } from "./party-screens";

const KIND_FILTERS: { value: QuotationsFilter["partyKind"]; label: string }[] =
  [
    { value: "all", label: "All" },
    { value: "contractor", label: "Contractors" },
    { value: "supplier", label: "Suppliers" },
  ];

/** The day it was uploaded, in India: "4 Mar 2026". */
const UPLOADED_ON = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

function screenOf(quotation: Quotation) {
  return PARTY_SCREENS[
    quotation.partyKind === "contractor" ? "contractors" : "suppliers"
  ];
}

/**
 * Masters → View Quotations (CM-501): every Contractor's and Supplier's
 * quotation files, newest first, searchable by party or file name. Files
 * are added and removed on the party's own page.
 */
export function QuotationsPage() {
  const [search, setSearch] = useState("");
  const [partyKind, setPartyKind] =
    useState<QuotationsFilter["partyKind"]>("all");
  const [cursor, setCursor] = useState<QuotationsFilter["cursor"]>(null);
  const deferredSearch = useDeferredValue(search);

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Masters", href: "/app/masters" }}
          title="View Quotations"
          meta="Quotation files from your Contractors and Suppliers. Add them on the Contractor's or Supplier's page."
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <InputGroup className="h-9 sm:max-w-xs">
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Search quotations"
              placeholder="Search party or file name"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setCursor(null);
              }}
            />
          </InputGroup>
          <ToggleGroup
            aria-label="Party"
            value={[partyKind]}
            onValueChange={(value: string[]) => {
              const next = value[0] as
                QuotationsFilter["partyKind"] | undefined;
              if (next == null) return;
              setPartyKind(next);
              setCursor(null);
            }}
            variant="outline"
            size="sm"
          >
            {KIND_FILTERS.map((filter) => (
              <ToggleGroupItem key={filter.value} value={filter.value}>
                {filter.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <Suspense fallback={<ListSkeleton />}>
          <QuotationRows
            filter={{ search: deferredSearch, partyKind, cursor }}
            onPage={setCursor}
          />
        </Suspense>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function QuotationRows({
  filter,
  onPage,
}: {
  filter: QuotationsFilter;
  onPage: (cursor: QuotationsFilter["cursor"]) => void;
}) {
  const { data } = useSuspenseQuery(quotationsQuery(filter));
  const filtered =
    filter.search.trim().length > 0 || filter.partyKind !== "all";

  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? "No quotations match" : "No quotations yet"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try another party or file name."
              : "Upload a quotation on a Contractor's or Supplier's page, under Masters, and it shows here."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {data.total} {data.total === 1 ? "quotation" : "quotations"}
      </p>
      <div className="rounded-lg border">
        <Table aria-label="Quotations">
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Party</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Uploaded by</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((quotation) => {
              const screen = screenOf(quotation);
              return (
                <TableRow key={quotation.id}>
                  <TableCell>
                    <div className="flex max-w-64 min-w-40 items-center gap-2">
                      <DocumentFileIcon
                        fileName={quotation.fileName}
                        contentType={quotation.contentType}
                        className="text-muted-foreground size-4 shrink-0"
                      />
                      <div className="min-w-0">
                        <p
                          className="truncate font-medium"
                          title={quotation.fileName}
                        >
                          {quotation.fileName}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {formatBytes(quotation.bytes)}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={partyEditPath(screen, quotation.partyId)}
                      className="hover:underline"
                    >
                      {quotation.partyName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {screen.label}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {UPLOADED_ON.format(new Date(quotation.createdAt))}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {quotation.createdByName ?? "—"}
                  </TableCell>
                  <TableCell>
                    <a
                      href={quotationOpenUrl(quotation)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${quotation.fileName}`}
                      className={buttonVariants({
                        variant: "ghost",
                        size: "sm",
                      })}
                    >
                      <ExternalLink aria-hidden="true" />
                      Open
                    </a>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {(data.prevCursor != null || data.nextCursor != null) && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.prevCursor == null}
            onClick={() => {
              if (data.prevCursor != null) onPage({ before: data.prevCursor });
            }}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={data.nextCursor == null}
            onClick={() => {
              if (data.nextCursor != null) onPage({ after: data.nextCursor });
            }}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
