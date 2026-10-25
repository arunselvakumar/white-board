"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  CircleDot,
  CircleOff,
  LayoutGrid,
  type LucideIcon,
  MoreHorizontal,
  Plus,
  Search,
} from "lucide-react";
import Link from "next/link";
import {
  type ReactNode,
  Suspense,
  useDeferredValue,
  useState,
  useTransition,
} from "react";
import { formatMobile } from "@repo/auth/construction/react";
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
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { FilterTabs } from "@repo/ui/components/filter-tabs";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/ui/components/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { cn } from "@repo/ui/lib/utils";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  partiesQuery,
  usePartyCommand,
  type Party,
  type PartyCommand,
  type PartyList,
  type PartyListFilter,
} from "@/src/queries/parties";

import {
  PARTY_SCREENS,
  partyEditPath,
  type PartyScreen,
} from "./party-screens";
import { PartyRowsSkeleton } from "./parties-skeletons";

const STATUS_FILTERS: {
  value: PartyListFilter["status"];
  label: string;
  icon: LucideIcon;
}[] = [
  { value: "all", label: "All", icon: LayoutGrid },
  { value: "active", label: "Active", icon: CircleDot },
  { value: "inactive", label: "Inactive", icon: CircleOff },
];

/** "Tower A +1": the first name and how many more. */
export function namesText(items: readonly { name: string }[]): string {
  const [first, ...rest] = items;
  if (first == null) return "—";
  return rest.length === 0
    ? first.name
    : `${first.name} +${String(rest.length)}`;
}

/**
 * Masters → Contractors or Suppliers (CM-406): search, status chips, the
 * newest first in pages, row actions.
 */
export function PartiesPage({ list }: { list: PartyList }) {
  const screen = PARTY_SCREENS[list];
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PartyListFilter["status"]>("all");
  const [cursor, setCursor] = useState<PartyListFilter["cursor"]>(null);
  const deferredSearch = useDeferredValue(search);
  // Filter and page changes keep the old rows on screen, dimmed (ADR-0047).
  const [isPending, startTransition] = useTransition();

  const addLink = (
    <Link href={`${screen.path}/new`} className={buttonVariants()}>
      <Plus aria-hidden="true" />
      Add {screen.label}
    </Link>
  );

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Masters", href: "/app/masters" }}
          title={screen.plural}
          meta={screen.meta}
          actions={addLink}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <InputGroup className="sm:max-w-xs">
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label={`Search ${screen.plural}`}
              placeholder="Search name, contact, GSTIN or mobile"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                startTransition(() => {
                  setCursor(null);
                });
              }}
            />
          </InputGroup>
          <FilterTabs
            aria-label="Status"
            items={STATUS_FILTERS}
            value={status}
            onValueChange={(next) => {
              startTransition(() => {
                setStatus(next);
                setCursor(null);
              });
            }}
          />
        </div>
        <Suspense fallback={<PartyRowsSkeleton screen={screen} />}>
          <PartyRows
            screen={screen}
            filter={{ search: deferredSearch, status, cursor }}
            onPage={(next) => {
              startTransition(() => {
                setCursor(next);
              });
            }}
            className={cn(isPending && "opacity-60 transition-opacity")}
            addLink={addLink}
          />
        </Suspense>
      </div>
    </div>
  );
}

function confirmText(
  screen: PartyScreen,
  kind: PartyCommand["kind"],
  name: string,
): { title: string; body: string; action: string } {
  switch (kind) {
    case "activate":
      return {
        title: `Activate ${name}?`,
        body: "They come back on the pickers, so they can be added to Projects again.",
        action: "Activate",
      };
    case "deactivate":
      return {
        title: `Deactivate ${name}?`,
        body: "They leave the pickers but stay on the Projects they are on.",
        action: "Deactivate",
      };
    case "delete":
      return {
        title: `Delete ${name}?`,
        body: `Only a ${screen.label} on no Project can be deleted. Take them off their Projects first, or deactivate them instead.`,
        action: "Delete",
      };
  }
}

function contactText(party: Party): string {
  const mobile = party.mobile == null ? null : formatMobile(party.mobile);
  return [party.contactPerson, mobile].filter(Boolean).join(" · ") || "—";
}

function PartyRows({
  screen,
  filter,
  onPage,
  addLink,
  className,
}: {
  screen: PartyScreen;
  filter: PartyListFilter;
  onPage: (cursor: PartyListFilter["cursor"]) => void;
  addLink: ReactNode;
  className?: string;
}) {
  const { data } = useSuspenseQuery(partiesQuery(screen.list, filter));
  const command = usePartyCommand(screen.list);
  // Kept after the dialog closes so its text stays while it animates out.
  const [pending, setPending] = useState<{
    kind: PartyCommand["kind"];
    party: Party;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const Icon = screen.icon;

  const filtered = filter.search.trim().length > 0 || filter.status !== "all";
  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? `No ${screen.plural} match` : `No ${screen.plural} yet`}
          </EmptyTitle>
          <EmptyDescription>
            {filtered ? "Try another name or status." : screen.empty}
          </EmptyDescription>
        </EmptyHeader>
        {!filtered && <EmptyContent>{addLink}</EmptyContent>}
      </Empty>
    );

  const confirm =
    pending == null
      ? null
      : confirmText(screen, pending.kind, pending.party.name);

  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-muted-foreground text-sm">
        {data.total} {data.total === 1 ? screen.label : screen.plural}
      </p>
      <div className="rounded-lg border">
        <Table aria-label={screen.plural}>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="hidden md:table-cell">GST state</TableHead>
              {screen.departments && <TableHead>Departments</TableHead>}
              <TableHead>Projects</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((party) => (
              <TableRow key={party.id}>
                <TableCell className="font-medium">
                  <Link
                    href={partyEditPath(screen, party.id)}
                    className="hover:underline"
                  >
                    {party.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {contactText(party)}
                </TableCell>
                <TableCell className="text-muted-foreground hidden md:table-cell">
                  {party.stateName ?? "—"}
                </TableCell>
                {screen.departments && (
                  <TableCell
                    className="text-muted-foreground max-w-48 truncate"
                    title={party.departments
                      .map((item) => item.name)
                      .join(", ")}
                  >
                    {namesText(party.departments)}
                  </TableCell>
                )}
                <TableCell
                  className="text-muted-foreground max-w-48 truncate"
                  title={party.projects.map((item) => item.name).join(", ")}
                >
                  {namesText(party.projects)}
                </TableCell>
                <TableCell>
                  {party.isActive ? (
                    <Badge variant="secondary">Active</Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${party.name}`}
                        />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        render={<Link href={partyEditPath(screen, party.id)} />}
                      >
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setError(undefined);
                          setPending({
                            kind: party.isActive ? "deactivate" : "activate",
                            party,
                          });
                          setConfirming(true);
                        }}
                      >
                        {party.isActive ? "Deactivate" : "Activate"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          setError(undefined);
                          setPending({ kind: "delete", party });
                          setConfirming(true);
                        }}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
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
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <FormAlert message={error} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant={pending?.kind === "delete" ? "destructive" : "default"}
              disabled={command.isPending}
              onClick={() => {
                if (pending == null) return;
                command.mutate(
                  { kind: pending.kind, id: pending.party.id },
                  {
                    onSuccess: () => {
                      setConfirming(false);
                    },
                    onError: (failure) => {
                      setError(fieldForCode(failure, {}).message);
                    },
                  },
                );
              }}
            >
              {confirm?.action}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
