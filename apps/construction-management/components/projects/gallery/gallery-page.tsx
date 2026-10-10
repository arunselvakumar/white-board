"use client";

import { useSuspenseQueries } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Images,
  Search,
  SearchX,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useId, useState, useTransition } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Input } from "@repo/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/ui/components/input-group";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { cn } from "@repo/ui/lib/utils";

import { formatBytes } from "@/lib/project-documents";
import {
  EMPTY_GALLERY_FILTER,
  galleryQuery,
  galleryUploadersQuery,
  type GalleryFilter,
  type GalleryItem,
  type GalleryUploader,
} from "@/src/queries/project-gallery";

import { FileThumbnail } from "../files/file-thumbnail";
import { FileViewer } from "../files/file-viewer";

const SEARCH_DELAY_MS = 300;

const ALL = "all";

const TYPE_FILTERS: { value: GalleryFilter["type"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "pdf", label: "PDFs" },
];

const SOURCE_FILTERS = [
  { value: ALL, label: "All sources" },
  { value: "document", label: "Documents" },
  { value: "drawing", label: "Drawings" },
  { value: "testing_report", label: "Testing reports" },
];

const SOURCE_LABELS: Record<string, string> = {
  document: "Document",
  drawing: "Drawing",
  testing_report: "Testing Report",
};

/** "Testing Report"; a later module's source reads from its key. */
function sourceLabel(source: string): string {
  const known = SOURCE_LABELS[source];
  if (known != null) return known;
  const words = source.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const DAY = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

function uploadedOn(item: GalleryItem): string {
  return DAY.format(new Date(item.uploadedAt));
}

/** "Karthik R · 4 Mar 2026", or just the date without a name. */
function tileMeta(item: GalleryItem): string {
  return [item.uploadedByName, uploadedOn(item)]
    .filter((part) => part != null && part.length > 0)
    .join(" · ");
}

/** "Drawing · Meena S · 6 Oct 2026 · 2.4 MB". */
function viewerMeta(item: GalleryItem): string {
  return [
    sourceLabel(item.source),
    item.uploadedByName,
    uploadedOn(item),
    formatBytes(item.bytes),
  ]
    .filter((part) => part != null && part.length > 0)
    .join(" · ");
}

function filesCount(count: number): string {
  return count === 1 ? "1 file" : `${String(count)} files`;
}

type FilterChange = Partial<Omit<GalleryFilter, "cursor">>;

/** The filters behind the phone's Filters button: Source, Uploaded by, dates. */
function moreFiltersCount(filter: GalleryFilter): number {
  return [
    filter.source !== ALL,
    filter.uploadedBy !== ALL,
    filter.from != null,
    filter.to != null,
  ].filter(Boolean).length;
}

function isFiltered(filter: GalleryFilter): boolean {
  return (
    filter.type !== "all" ||
    filter.search.trim().length > 0 ||
    moreFiltersCount(filter) > 0
  );
}

/** Source, Uploaded by, From and To: inline from `sm` up, in the sheet below. */
function MoreFilters({
  filter,
  uploaders,
  onChange,
  className,
}: {
  filter: GalleryFilter;
  uploaders: GalleryUploader[];
  onChange: (change: FilterChange) => void;
  className?: string;
}) {
  const id = useId();
  const people = [
    { value: ALL, label: "Anyone" },
    ...uploaders.map((uploader) => ({
      value: uploader.userId,
      label: uploader.name ?? "Name not known",
    })),
  ];
  return (
    <div className={className}>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-source`}>Source</Label>
        <Select
          items={SOURCE_FILTERS}
          value={filter.source}
          onValueChange={(next) => {
            onChange({ source: next ?? ALL });
          }}
        >
          <SelectTrigger id={`${id}-source`} className="h-9 w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {SOURCE_FILTERS.map((source) => (
              <SelectItem key={source.value} value={source.value}>
                {source.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-uploader`}>Uploaded by</Label>
        <Select
          items={people}
          value={filter.uploadedBy}
          onValueChange={(next) => {
            onChange({ uploadedBy: next ?? ALL });
          }}
        >
          <SelectTrigger id={`${id}-uploader`} className="h-9 w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {people.map((person) => (
              <SelectItem key={person.value} value={person.value}>
                {person.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:contents">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`${id}-from`}>From</Label>
          <Input
            id={`${id}-from`}
            type="date"
            className="h-9 sm:w-40"
            value={filter.from ?? ""}
            max={filter.to ?? undefined}
            onChange={(event) => {
              const value = event.target.value;
              onChange({ from: value.length > 0 ? value : null });
            }}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`${id}-to`}>To</Label>
          <Input
            id={`${id}-to`}
            type="date"
            className="h-9 sm:w-40"
            value={filter.to ?? ""}
            min={filter.from ?? undefined}
            onChange={(event) => {
              const value = event.target.value;
              onChange({ to: value.length > 0 ? value : null });
            }}
          />
        </div>
      </div>
    </div>
  );
}

function GalleryTile({
  item,
  onOpen,
}: {
  item: GalleryItem;
  onOpen: (item: GalleryItem) => void;
}) {
  const id = useId();
  return (
    <li className="min-w-0">
      <Button
        type="button"
        variant="ghost"
        aria-labelledby={`${id}-name`}
        aria-describedby={`${id}-meta`}
        className="h-auto w-full min-w-0 flex-col items-stretch gap-1.5 p-1.5 text-left font-normal whitespace-normal"
        onClick={() => {
          onOpen(item);
        }}
      >
        <FileThumbnail
          file={{
            name: item.fileName,
            url: item.fileUrl,
            contentType: item.contentType,
            thumbUrl: item.thumbUrl,
          }}
          className="w-full"
        />
        <span
          id={`${id}-name`}
          className="truncate text-sm font-medium"
          title={item.fileName}
        >
          {item.fileName}
        </span>
        <span
          id={`${id}-meta`}
          className="text-muted-foreground flex min-w-0 flex-col text-xs"
        >
          <span className="truncate">{sourceLabel(item.source)}</span>
          <span className="truncate">{tileMeta(item)}</span>
        </span>
      </Button>
    </li>
  );
}

/**
 * The Project's Gallery (CM-410): every image and PDF kept on the Project —
 * Documents, Drawing Revisions, Testing Reports — in one read-only grid,
 * newest first. Filters narrow it by type, source, uploader, date and file
 * name; a tile opens the file in the viewer. Only files from the sources the
 * Team Member may read are listed, so every tile opens.
 */
export function GalleryPage({ projectId }: { projectId: string }) {
  const [filter, setFilter] = useState<GalleryFilter>(EMPTY_GALLERY_FILTER);
  const [search, setSearch] = useState("");
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // A new filter or page keeps the current grid up (dimmed) while it loads.
  const [loading, startTransition] = useTransition();
  const [{ data: page }, { data: uploaders }] = useSuspenseQueries({
    queries: [
      galleryQuery(projectId, filter),
      galleryUploadersQuery(projectId),
    ],
  });

  useEffect(() => {
    if (search === filter.search) return;
    const timer = setTimeout(() => {
      setViewingId(null);
      startTransition(() => {
        setFilter((current) => ({ ...current, search, cursor: null }));
      });
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [search, filter.search]);

  const change = (next: FilterChange) => {
    setViewingId(null);
    startTransition(() => {
      setFilter((current) => ({ ...current, ...next, cursor: null }));
    });
  };

  const clear = () => {
    setSearch("");
    setViewingId(null);
    startTransition(() => {
      setFilter(EMPTY_GALLERY_FILTER);
    });
  };

  const turnPage = (cursor: GalleryFilter["cursor"]) => {
    setViewingId(null);
    startTransition(() => {
      setFilter((current) => ({ ...current, cursor }));
    });
  };

  const filtered = isFiltered(filter);
  const moreCount = moreFiltersCount(filter);
  const items = page.items;
  const viewingIndex = items.findIndex((item) => item.id === viewingId);
  const viewing = items[viewingIndex];

  if (page.total === 0 && !filtered && search.length === 0)
    return (
      <div className="w-full max-w-5xl space-y-5 p-6">
        <h2 className="font-semibold">Gallery</h2>
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Images />
            </EmptyMedia>
            <EmptyTitle>No files on this Project yet</EmptyTitle>
            <EmptyDescription>
              Photos and PDFs from Documents, Drawings and Testing Reports show
              here. Add them where they belong.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );

  return (
    <div className="w-full max-w-5xl space-y-5 p-6">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-semibold">Gallery</h2>
        {page.total > 0 ? (
          <p className="text-muted-foreground text-sm tabular-nums">
            {filesCount(page.total)}
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="h-9 w-full sm:w-64">
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Search files"
              placeholder="Search file name"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
          </InputGroup>
          <ToggleGroup
            aria-label="Type"
            value={[filter.type]}
            onValueChange={(value: string[]) => {
              const next = value[0] as GalleryFilter["type"] | undefined;
              if (next != null) change({ type: next });
            }}
            variant="outline"
            size="sm"
          >
            {TYPE_FILTERS.map((type) => (
              <ToggleGroupItem key={type.value} value={type.value}>
                {type.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="sm:hidden"
            aria-label={
              moreCount > 0 ? `Filters, ${String(moreCount)} on` : "Filters"
            }
            onClick={() => {
              setFiltersOpen(true);
            }}
          >
            <SlidersHorizontal aria-hidden="true" />
            Filters
            {moreCount > 0 ? (
              <Badge className="tabular-nums" aria-hidden="true">
                {moreCount}
              </Badge>
            ) : null}
          </Button>
          {filtered && items.length > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={clear}>
              Clear filters
            </Button>
          ) : null}
        </div>
        <MoreFilters
          filter={filter}
          uploaders={uploaders.items}
          onChange={change}
          className="hidden sm:flex sm:flex-wrap sm:items-end sm:gap-3"
        />
      </div>

      {items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>No files match these filters</EmptyTitle>
            <EmptyDescription>
              Try another name, source or date.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" onClick={clear}>
              Clear filters
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ul
          aria-label="Files"
          aria-busy={loading}
          className={cn(
            "grid grid-cols-2 gap-2 transition-opacity sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
            loading && "opacity-60",
          )}
        >
          {items.map((item) => (
            <GalleryTile
              key={item.id}
              item={item}
              onOpen={(opened) => {
                setViewingId(opened.id);
              }}
            />
          ))}
        </ul>
      )}

      {page.prevCursor != null || page.nextCursor != null ? (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page.prevCursor == null || loading}
            onClick={() => {
              if (page.prevCursor != null)
                turnPage({ before: page.prevCursor });
            }}
          >
            <ChevronLeft aria-hidden="true" />
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page.nextCursor == null || loading}
            onClick={() => {
              if (page.nextCursor != null) turnPage({ after: page.nextCursor });
            }}
          >
            Next
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <MoreFilters
            filter={filter}
            uploaders={uploaders.items}
            onChange={change}
            className="space-y-4 px-4"
          />
          <SheetFooter className="flex-row justify-end">
            {moreCount > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  change({
                    source: ALL,
                    uploadedBy: ALL,
                    from: null,
                    to: null,
                  });
                }}
              >
                Clear filters
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={() => {
                setFiltersOpen(false);
              }}
            >
              Show {filesCount(page.total)}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <FileViewer
        file={
          viewing == null
            ? null
            : {
                name: viewing.fileName,
                url: viewing.fileUrl,
                contentType: viewing.contentType,
              }
        }
        description={viewing == null ? undefined : viewerMeta(viewing)}
        onClose={() => {
          setViewingId(null);
        }}
        actions={
          viewing == null || items.length < 2 ? null : (
            <div className="flex items-center justify-between gap-2 sm:mr-auto sm:justify-start">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Previous file"
                disabled={viewingIndex <= 0}
                onClick={() => {
                  setViewingId(items[viewingIndex - 1]?.id ?? viewingId);
                }}
              >
                <ChevronLeft />
              </Button>
              <span className="text-muted-foreground text-sm tabular-nums">
                {viewingIndex + 1} of {items.length}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Next file"
                disabled={viewingIndex >= items.length - 1}
                onClick={() => {
                  setViewingId(items[viewingIndex + 1]?.id ?? viewingId);
                }}
              >
                <ChevronRight />
              </Button>
            </div>
          )
        }
      />
    </div>
  );
}
