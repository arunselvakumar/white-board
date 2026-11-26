"use client";

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Skeleton } from "@repo/ui/components/skeleton";

import { FormAlert } from "@/components/auth/form-alert";
import { QueryHttpError } from "@/src/queries/http";
import {
  archivePreschoolDomain,
  createPreschoolDomain,
  preschoolDomainsQueryOptions,
  preschoolObservationKeys,
  renamePreschoolDomain,
  restorePreschoolDomain,
} from "@/src/queries/preschool/observations";

function DomainList() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(preschoolDomainsQueryOptions(true));
  const [names, setNames] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string>();
  const run = async (work: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await work();
      await queryClient.invalidateQueries({
        queryKey: preschoolObservationKeys.all,
      });
    } catch (caught) {
      setError(
        caught instanceof QueryHttpError
          ? caught.message
          : "Could not save. Please try again.",
      );
    }
  };
  return (
    <div className="space-y-4">
      <FormAlert message={error} />
      <ul className="space-y-2">
        {data.items.map((domain) => {
          const name = names[domain.id] ?? domain.name;
          return (
            <li key={domain.id} className="flex flex-wrap items-center gap-2">
              <Input
                aria-label={`Name of ${domain.name}`}
                className="h-9 min-w-0 flex-1"
                value={name}
                disabled={domain.archived}
                onChange={(event) => {
                  setNames((all) => ({
                    ...all,
                    [domain.id]: event.target.value,
                  }));
                }}
              />
              {domain.archived ? (
                <Badge variant="outline">Archived</Badge>
              ) : null}
              {!domain.archived && name.trim() !== domain.name ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    void run(() =>
                      renamePreschoolDomain(domain.id, {
                        name,
                        description: domain.description,
                      }),
                    );
                  }}
                >
                  Rename
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  void run(() =>
                    domain.archived
                      ? restorePreschoolDomain(domain.id)
                      : archivePreschoolDomain(domain.id),
                  );
                }}
              >
                {domain.archived ? "Restore" : "Archive"}
              </Button>
            </li>
          );
        })}
      </ul>
      <form
        className="flex gap-2"
        aria-label="Add a Development Domain"
        onSubmit={(event) => {
          event.preventDefault();
          if (newName.trim() === "") return;
          void run(async () => {
            await createPreschoolDomain({ name: newName });
            setNewName("");
          });
        }}
      >
        <Input
          aria-label="New Development Domain"
          placeholder="Music and movement"
          className="h-9 min-w-0 flex-1"
          value={newName}
          onChange={(event) => {
            setNewName(event.target.value);
          }}
        />
        <Button type="submit" size="sm">
          Add
        </Button>
      </form>
    </div>
  );
}

/** The Owner's list of Development Domains: add, rename, archive, restore. */
export function DomainsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Development Domains</DialogTitle>
          <DialogDescription>
            Observations and Progress Reports use these. An archived Domain
            leaves the forms; reports that rated it keep it.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <Suspense fallback={<Skeleton className="h-48 w-full" />}>
            <DomainList />
          </Suspense>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
