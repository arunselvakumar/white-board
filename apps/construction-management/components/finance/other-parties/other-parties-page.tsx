"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Handshake, Plus, Search } from "lucide-react";
import Link from "next/link";
import { Suspense, useDeferredValue, useState, type ReactNode } from "react";
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

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { namesText } from "@/components/parties/parties-page";
import { fieldForCode } from "@/lib/server-errors";
import {
  otherPartiesQuery,
  useDeleteOtherParty,
  type OtherParty,
  type OtherPartyListFilter,
} from "@/src/queries/finance-other-parties";

import {
  OTHER_PARTIES_PATH,
  otherPartyEditPath,
} from "./other-party-form-schema";

/**
 * Masters → Other Parties (CM-704, ADR CM-0017 §11): parties that are not
 * Contractors, Suppliers, Labours or Vendors — landlords, consultants,
 * buyers of scrap. Search, newest first in pages, edit and delete.
 */
export function OtherPartiesPage() {
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<OtherPartyListFilter["cursor"]>(null);
  const deferredSearch = useDeferredValue(search);

  const addLink = (
    <Link href={`${OTHER_PARTIES_PATH}/new`} className={buttonVariants()}>
      <Plus aria-hidden="true" />
      Add Other Party
    </Link>
  );

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Masters", href: "/app/masters" }}
          title="Other Parties"
          meta="Parties you bill or pay that are not Contractors, Suppliers, Labours or Vendors."
          actions={addLink}
        />
        <InputGroup className="h-9 sm:max-w-xs">
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search Other Parties"
            placeholder="Search name, email, GSTIN or mobile"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCursor(null);
            }}
          />
        </InputGroup>
        <Suspense
          fallback={
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          }
        >
          <OtherPartyRows
            filter={{ search: deferredSearch, cursor }}
            onPage={setCursor}
            addLink={addLink}
          />
        </Suspense>
      </div>
    </div>
  );
}

function contactText(party: OtherParty): string {
  const mobile = party.mobile == null ? null : formatMobile(party.mobile);
  return [mobile, party.email].filter(Boolean).join(" · ") || "—";
}

function OtherPartyRows({
  filter,
  onPage,
  addLink,
}: {
  filter: OtherPartyListFilter;
  onPage: (cursor: OtherPartyListFilter["cursor"]) => void;
  addLink: ReactNode;
}) {
  const { data } = useSuspenseQuery(otherPartiesQuery(filter));
  const remove = useDeleteOtherParty();
  // Kept after the dialog closes so its text stays while it animates out.
  const [pending, setPending] = useState<OtherParty | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const filtered = filter.search.trim().length > 0;
  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Handshake />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? "No Other Parties match" : "No Other Parties yet"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try another name, GSTIN or mobile."
              : "Add the landlords, consultants and buyers you bill or pay, with the Projects they work on."}
          </EmptyDescription>
        </EmptyHeader>
        {!filtered && <EmptyContent>{addLink}</EmptyContent>}
      </Empty>
    );

  const ask = (party: OtherParty) => {
    setError(undefined);
    setPending(party);
    setConfirming(true);
  };

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {data.total} {data.total === 1 ? "Other Party" : "Other Parties"}
      </p>
      <FormAlert message={confirming ? undefined : error} />
      <div className="hidden rounded-lg border md:block">
        <Table aria-label="Other Parties">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>GSTIN</TableHead>
              <TableHead>Projects</TableHead>
              <TableHead className="w-32">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((party) => (
              <TableRow key={party.id}>
                <TableCell className="font-medium">
                  <Link
                    href={otherPartyEditPath(party.id)}
                    className="hover:underline"
                  >
                    {party.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground max-w-56 truncate">
                  {contactText(party)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {party.gstin ?? party.stateName ?? "—"}
                </TableCell>
                <TableCell
                  className="text-muted-foreground max-w-48 truncate"
                  title={party.projects.map((item) => item.name).join(", ")}
                >
                  {namesText(party.projects)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Link
                      href={otherPartyEditPath(party.id)}
                      className={buttonVariants({
                        variant: "ghost",
                        size: "sm",
                      })}
                      aria-label={`Edit ${party.name}`}
                    >
                      Edit
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      aria-label={`Delete ${party.name}`}
                      onClick={() => {
                        ask(party);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label="Other Parties" className="space-y-2 md:hidden">
        {data.items.map((party) => (
          <li key={party.id} className="rounded-lg border p-3">
            <div className="min-w-0">
              <Link
                href={otherPartyEditPath(party.id)}
                className="block truncate font-medium hover:underline"
              >
                {party.name}
              </Link>
              <p className="text-muted-foreground truncate text-xs">
                {contactText(party)}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {namesText(party.projects)}
                {party.gstin != null && ` · ${party.gstin}`}
              </p>
            </div>
            <div className="mt-2 flex justify-end gap-1">
              <Link
                href={otherPartyEditPath(party.id)}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
                aria-label={`Edit ${party.name}`}
              >
                Edit
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                aria-label={`Delete ${party.name}`}
                onClick={() => {
                  ask(party);
                }}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
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
            <AlertDialogTitle>Delete {pending?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              An Other Party with invoices, payments or an opening balance
              cannot be deleted. Paid To labels on Transactions and vouchers
              keep its name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FormAlert message={error} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (pending == null) return;
                remove.mutate(pending, {
                  onSuccess: () => {
                    setConfirming(false);
                  },
                  onError: (failure) => {
                    setError(fieldForCode(failure, {}).message);
                  },
                });
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
