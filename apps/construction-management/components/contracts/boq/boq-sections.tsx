"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  useBoqItemCommand,
  useSectionCommand,
  type Boq,
  type BoqItem,
  type BoqSection,
} from "@/src/queries/contracts-boq";
import type { Flag } from "@/src/shared-kernel/access";

import { money, quantity } from "./boq-format";

type Confirm =
  { kind: "section"; section: BoqSection } | { kind: "item"; item: BoqItem };

export type BoqSectionActions = {
  onAddItem: (sectionId: string) => void;
  onRename: (section: BoqSection) => void;
  onEditItem: (item: BoqItem) => void;
  onRaise: (item: BoqItem) => void;
};

function ItemBadges({ item }: { item: BoqItem }) {
  return (
    <>
      {item.measured ? (
        <Badge variant="secondary" className="ml-1.5">
          Measured
        </Badge>
      ) : null}
      {item.pendingVariation == null ? null : (
        <Badge variant="outline" className="ml-1.5">
          {item.pendingVariation.number} pending
        </Badge>
      )}
    </>
  );
}

/** Current beside original, when a Variation changed it. */
function CurrentQuantity({ item }: { item: BoqItem }) {
  const changed = item.quantity !== item.originalQuantity;
  return (
    <span className={changed ? "font-medium" : undefined}>
      {quantity(item.quantity)}
    </span>
  );
}

function ItemActions({
  item,
  flags,
  first,
  last,
  busy,
  actions,
  onMove,
  onDelete,
}: {
  item: BoqItem;
  flags: readonly Flag[];
  first: boolean;
  last: boolean;
  busy: boolean;
  actions: BoqSectionActions;
  onMove: (direction: "up" | "down") => void;
  onDelete: () => void;
}) {
  const canUpdate = flags.includes("update");
  const canRaise = flags.includes("create");
  const canDelete = flags.includes("delete");
  if (!canUpdate && !canRaise && !canDelete) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            aria-label={`Actions for item ${item.itemNo}`}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {canUpdate ? (
          <>
            <DropdownMenuItem
              onClick={() => {
                actions.onEditItem(item);
              }}
            >
              <Pencil aria-hidden="true" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={first}
              onClick={() => {
                onMove("up");
              }}
            >
              <ArrowUp aria-hidden="true" />
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={last}
              onClick={() => {
                onMove("down");
              }}
            >
              <ArrowDown aria-hidden="true" />
              Move down
            </DropdownMenuItem>
          </>
        ) : null}
        {canRaise && item.pendingVariation == null ? (
          <DropdownMenuItem
            onClick={() => {
              actions.onRaise(item);
            }}
          >
            Raise variation
          </DropdownMenuItem>
        ) : null}
        {canDelete && !item.measured ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 aria-hidden="true" />
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SectionGroup({
  section,
  index,
  count,
  boq,
  busy,
  actions,
  onMoveSection,
  onMoveItem,
  onConfirm,
}: {
  section: BoqSection;
  index: number;
  count: number;
  boq: Boq;
  busy: boolean;
  actions: BoqSectionActions;
  onMoveSection: (direction: "up" | "down") => void;
  onMoveItem: (item: BoqItem, direction: "up" | "down") => void;
  onConfirm: (confirm: Confirm) => void;
}) {
  const [open, setOpen] = useState(true);
  const flags = boq.viewerFlags;
  const { financial } = boq;
  const headingId = `boq-section-${section.id}`;
  const place = boq.structure === "wings" ? "Wing" : "Location";
  const itemActions = (item: BoqItem, at: number) => (
    <ItemActions
      item={item}
      flags={flags}
      first={at === 0}
      last={at === section.items.length - 1}
      busy={busy}
      actions={actions}
      onMove={(direction) => {
        onMoveItem(item, direction);
      }}
      onDelete={() => {
        onConfirm({ kind: "item", item });
      }}
    />
  );
  return (
    <section
      aria-labelledby={headingId}
      className="bg-card min-w-0 overflow-hidden rounded-xl border"
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="bg-muted/40 flex min-w-0 flex-wrap items-center gap-2 px-2 py-1.5">
          <CollapsibleTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                className="h-auto min-w-0 shrink gap-2 px-2 py-1.5 text-left font-semibold whitespace-normal [&[data-panel-open]>svg]:rotate-90"
              />
            }
          >
            <ChevronRight aria-hidden="true" className="transition-transform" />
            <span id={headingId} className="min-w-0 break-words">
              {section.title}
            </span>
            <Badge variant="secondary">{section.items.length}</Badge>
          </CollapsibleTrigger>
          <span className="ml-auto flex items-center gap-1">
            {financial ? (
              <span className="px-2 text-sm font-medium tabular-nums">
                {money(section.subtotal)}
              </span>
            ) : null}
            {flags.includes("create") ||
            flags.includes("update") ||
            flags.includes("delete") ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      aria-label={`Actions for ${section.title}`}
                    />
                  }
                >
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {flags.includes("create") ? (
                    <DropdownMenuItem
                      onClick={() => {
                        actions.onAddItem(section.id);
                      }}
                    >
                      <Plus aria-hidden="true" />
                      Add item here
                    </DropdownMenuItem>
                  ) : null}
                  {flags.includes("update") ? (
                    <>
                      <DropdownMenuItem
                        onClick={() => {
                          actions.onRename(section);
                        }}
                      >
                        <Pencil aria-hidden="true" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={index === 0}
                        onClick={() => {
                          onMoveSection("up");
                        }}
                      >
                        <ArrowUp aria-hidden="true" />
                        Move up
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={index === count - 1}
                        onClick={() => {
                          onMoveSection("down");
                        }}
                      >
                        <ArrowDown aria-hidden="true" />
                        Move down
                      </DropdownMenuItem>
                    </>
                  ) : null}
                  {flags.includes("delete") && section.items.length === 0 ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          onConfirm({ kind: "section", section });
                        }}
                      >
                        <Trash2 aria-hidden="true" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </span>
        </div>
        <CollapsibleContent>
          {section.items.length === 0 ? (
            <p className="text-muted-foreground border-t px-4 py-3 text-sm">
              No items in this section yet.
            </p>
          ) : (
            <>
              {/* A wide table scrolls inside its own frame, never the page. */}
              <div className="hidden overflow-x-auto border-t md:block">
                <Table
                  aria-label={`${section.title} items`}
                  className="min-w-[56rem]"
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Item no</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-16">UoM</TableHead>
                      <TableHead className="w-24 text-right">
                        Original qty
                      </TableHead>
                      <TableHead className="w-24 text-right">
                        Current qty
                      </TableHead>
                      {financial ? (
                        <>
                          <TableHead className="w-28 text-right">
                            Rate
                          </TableHead>
                          <TableHead className="w-32 text-right">
                            Amount
                          </TableHead>
                        </>
                      ) : null}
                      <TableHead className="w-28">{place}</TableHead>
                      <TableHead className="w-12">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {section.items.map((item, at) => (
                      <TableRow key={item.id}>
                        <TableCell className="align-top font-medium tabular-nums">
                          {item.itemNo}
                        </TableCell>
                        <TableCell className="max-w-96 align-top whitespace-normal">
                          <span className="line-clamp-3">
                            {item.description}
                          </span>
                          <ItemBadges item={item} />
                        </TableCell>
                        <TableCell className="text-muted-foreground align-top">
                          {item.uomName}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-right align-top tabular-nums">
                          {quantity(item.originalQuantity)}
                        </TableCell>
                        <TableCell className="text-right align-top tabular-nums">
                          <CurrentQuantity item={item} />
                        </TableCell>
                        {financial ? (
                          <>
                            <TableCell className="text-right align-top tabular-nums">
                              {money(item.rate)}
                            </TableCell>
                            <TableCell className="text-right align-top font-medium tabular-nums">
                              {money(item.amount)}
                            </TableCell>
                          </>
                        ) : null}
                        <TableCell className="text-muted-foreground align-top whitespace-normal">
                          {item.placeName ?? "—"}
                        </TableCell>
                        <TableCell className="align-top">
                          {itemActions(item, at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ul
                aria-label={`${section.title} items`}
                className="divide-y border-t md:hidden"
              >
                {section.items.map((item, at) => (
                  <li key={item.id} className="min-w-0 space-y-1 px-4 py-3">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <p className="min-w-0 text-sm break-words">
                        <span className="font-semibold tabular-nums">
                          {item.itemNo}
                        </span>{" "}
                        {item.description}
                      </p>
                      <span className="shrink-0">{itemActions(item, at)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums">
                      <span>
                        <CurrentQuantity item={item} /> {item.uomName}
                      </span>
                      {item.quantity !== item.originalQuantity ? (
                        <span className="text-muted-foreground text-xs">
                          was {quantity(item.originalQuantity)}
                        </span>
                      ) : null}
                      {financial ? (
                        <span className="text-muted-foreground">
                          at {money(item.rate)}
                        </span>
                      ) : null}
                      {financial ? (
                        <span className="ml-auto font-medium">
                          {money(item.amount)}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 text-xs">
                      {item.placeName == null ? null : (
                        <span className="text-muted-foreground">
                          {item.placeName}
                        </span>
                      )}
                      <ItemBadges item={item} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

/**
 * The BOQ's sections as collapsible groups (CM-1103): each with its items
 * (a table that scrolls inside its frame from md up, cards below) and its
 * subtotal. Without BOQ Financial only quantities show. Actions follow the
 * viewer's BOQ flags; every route checks again.
 */
export function BoqSections({
  boq,
  actions,
}: {
  boq: Boq;
  actions: BoqSectionActions;
}) {
  const sections = useSectionCommand();
  const items = useBoqItemCommand();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const busy = sections.isPending || items.isPending;
  const failed = (failure: unknown) => {
    setError(fieldForCode(failure, {}).message);
  };
  const confirmTitle =
    confirm?.kind === "section"
      ? `Delete ${confirm.section.title}?`
      : confirm?.kind === "item"
        ? `Delete item ${confirm.item.itemNo}?`
        : "";

  return (
    <div className="min-w-0 space-y-3">
      <FormAlert message={open ? undefined : error} />
      {boq.sections.map((section, index) => (
        <SectionGroup
          key={section.id}
          section={section}
          index={index}
          count={boq.sections.length}
          boq={boq}
          busy={busy}
          actions={actions}
          onMoveSection={(direction) => {
            setError(undefined);
            sections.mutate(
              { kind: "move", id: section.id, direction },
              { onError: failed },
            );
          }}
          onMoveItem={(item, direction) => {
            setError(undefined);
            items.mutate(
              { kind: "move", id: item.id, direction },
              { onError: failed },
            );
          }}
          onConfirm={(next) => {
            setError(undefined);
            setConfirm(next);
            setOpen(true);
          }}
        />
      ))}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">
              {confirmTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "item"
                ? "It leaves the BOQ. An item that has been measured cannot be deleted."
                : "The section leaves the BOQ. Only an empty section can be deleted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FormAlert message={error} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (confirm == null) return;
                const done = {
                  onSuccess: () => {
                    setOpen(false);
                  },
                  onError: failed,
                };
                if (confirm.kind === "section")
                  sections.mutate(
                    {
                      kind: "delete",
                      id: confirm.section.id,
                      expectedUpdatedAt: confirm.section.updatedAt,
                    },
                    done,
                  );
                else
                  items.mutate(
                    {
                      kind: "delete",
                      id: confirm.item.id,
                      expectedUpdatedAt: confirm.item.updatedAt,
                    },
                    done,
                  );
              }}
            >
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
