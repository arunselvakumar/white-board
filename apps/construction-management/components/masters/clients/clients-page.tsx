"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Briefcase, Plus, Search } from "lucide-react";
import Link from "next/link";
import {
  Suspense,
  useDeferredValue,
  useState,
  useTransition,
  type ReactNode,
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
  clientsQuery,
  useDeleteClient,
  type Client,
  type ClientListFilter,
} from "@/src/queries/masters-clients";

import { CLIENTS_PATH, clientEditPath } from "./client-form-schema";
import { CLIENT_COLUMNS, ClientRowsSkeleton } from "./clients-skeletons";

/**
 * Master records → Clients (CM-1101, ADR CM-0023 §2): who the Company
 * builds for and bills. Search, newest first in pages, edit and delete; a
 * Client a Project links cannot be deleted.
 */
export function ClientsPage() {
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<ClientListFilter["cursor"]>(null);
  const deferredSearch = useDeferredValue(search);
  const [paging, startPaging] = useTransition();

  const addLink = (
    <Link href={`${CLIENTS_PATH}/new`} className={buttonVariants()}>
      <Plus aria-hidden="true" />
      Add Client
    </Link>
  );

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Masters", href: "/app/masters" }}
          title="Clients"
          meta="Who you build for and bill: their GSTIN, PAN, TAN and billing address."
          actions={addLink}
        />
        <InputGroup className="h-9 sm:max-w-xs">
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search Clients"
            placeholder="Search name, contact, GSTIN or mobile"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCursor(null);
            }}
          />
        </InputGroup>
        <div className={cn(paging && "opacity-60 transition-opacity")}>
          <Suspense fallback={<ClientRowsSkeleton />}>
            <ClientRows
              filter={{ search: deferredSearch, cursor }}
              onPage={(next) => {
                startPaging(() => {
                  setCursor(next);
                });
              }}
              addLink={addLink}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function contactText(client: Client): string {
  const mobile = client.mobile == null ? null : formatMobile(client.mobile);
  return (
    [client.contactPerson, mobile, client.email].filter(Boolean).join(" · ") ||
    "—"
  );
}

function StatusBadge({ client }: { client: Client }) {
  return client.isActive ? (
    <Badge variant="secondary">Active</Badge>
  ) : (
    <Badge variant="outline">Inactive</Badge>
  );
}

function ClientRows({
  filter,
  onPage,
  addLink,
}: {
  filter: ClientListFilter;
  onPage: (cursor: ClientListFilter["cursor"]) => void;
  addLink: ReactNode;
}) {
  const { data } = useSuspenseQuery(clientsQuery(filter));
  const remove = useDeleteClient();
  // Kept after the dialog closes so its text stays while it animates out.
  const [pending, setPending] = useState<Client | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const filtered = filter.search.trim().length > 0;
  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Briefcase />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? "No Clients match" : "No Clients yet"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try another name, GSTIN or mobile."
              : "Add the builders, departments and owners you do contract work for, then link them to their Projects."}
          </EmptyDescription>
        </EmptyHeader>
        {!filtered && <EmptyContent>{addLink}</EmptyContent>}
      </Empty>
    );

  const ask = (client: Client) => {
    setError(undefined);
    setPending(client);
    setConfirming(true);
  };

  const actions = (client: Client) => (
    <>
      <Link
        href={clientEditPath(client.id)}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
        aria-label={`Edit ${client.name}`}
      >
        Edit
      </Link>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive"
        aria-label={`Delete ${client.name}`}
        onClick={() => {
          ask(client);
        }}
      >
        Delete
      </Button>
    </>
  );

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {data.total} {data.total === 1 ? "Client" : "Clients"}
      </p>
      <FormAlert message={confirming ? undefined : error} />
      <div className="hidden rounded-lg border md:block">
        <Table aria-label="Clients">
          <TableHeader>
            <TableRow>
              {CLIENT_COLUMNS.map((column, index) => (
                <TableHead key={index} className={column.className}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((client) => (
              <TableRow key={client.id}>
                <TableCell className="font-medium">
                  <Link
                    href={clientEditPath(client.id)}
                    className="hover:underline"
                  >
                    {client.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground max-w-56 truncate">
                  {contactText(client)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {client.gstin ?? client.stateName ?? "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge client={client} />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {actions(client)}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label="Clients" className="space-y-2 md:hidden">
        {data.items.map((client) => (
          <li key={client.id} className="rounded-lg border p-3">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={clientEditPath(client.id)}
                  className="block truncate font-medium hover:underline"
                >
                  {client.name}
                </Link>
                <p className="text-muted-foreground truncate text-xs">
                  {contactText(client)}
                </p>
                {client.gstin == null ? null : (
                  <p className="text-muted-foreground truncate text-xs">
                    {client.gstin}
                  </p>
                )}
              </div>
              <StatusBadge client={client} />
            </div>
            <div className="mt-2 flex justify-end gap-1">{actions(client)}</div>
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
              A Client linked to a Project cannot be deleted. Change those
              Projects&apos; Client first, or make the Client inactive.
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
