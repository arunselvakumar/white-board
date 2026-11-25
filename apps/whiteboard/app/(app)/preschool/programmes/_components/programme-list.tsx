"use client";

import { BookOpenTextIcon } from "@phosphor-icons/react/ssr";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";
import { Label } from "@repo/ui/components/label";
import { Switch } from "@repo/ui/components/switch";

import { FormAlert } from "@/components/auth/form-alert";
import { preschoolKeys } from "@/src/queries/preschool/me";
import {
  archiveProgramme,
  createProgramme,
  programmesQueryOptions,
  reorderProgrammes,
  restoreProgramme,
  updateProgrammeDetails,
  type PreschoolProgramme,
  type PreschoolProgrammeInput,
} from "@/src/queries/preschool/programmes";

import { ageRangeLabel } from "@/lib/preschool-age-range";
import { ProgrammeFormDialog } from "./programme-form-dialog";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== ""
    ? error.message
    : fallback;
}

/**
 * The Workspace's Programmes in display order: add, edit, archive, restore,
 * and move up or down. Archived ones show only with "Show archived".
 */
export function ProgrammeList() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(
    programmesQueryOptions({ includeArchived: true }),
  );
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<PreschoolProgramme | "new" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: preschoolKeys.all });
  const onError = (fallback: string) => (failure: unknown) => {
    setError(errorMessage(failure, fallback));
  };
  const save = useMutation({
    mutationFn: (input: PreschoolProgrammeInput) =>
      editing === "new" || editing == null
        ? createProgramme(input)
        : updateProgrammeDetails(editing.id, input),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });
  const archive = useMutation({
    mutationFn: archiveProgramme,
    onSuccess: refresh,
    onError: onError("Could not archive this Programme."),
  });
  const restore = useMutation({
    mutationFn: restoreProgramme,
    onSuccess: refresh,
    onError: onError("Could not restore this Programme."),
  });
  const reorder = useMutation({
    mutationFn: reorderProgrammes,
    onSuccess: refresh,
    onError: onError("Could not change the order."),
  });

  const active = data.items.filter((programme) => !programme.isArchived);
  const archivedCount = data.items.length - active.length;
  const shown = showArchived ? data.items : active;
  const busy = reorder.isPending || archive.isPending || restore.isPending;

  const move = (id: string, by: -1 | 1) => {
    const ids = active.map((programme) => programme.id);
    const from = ids.indexOf(id);
    const to = from + by;
    const other = ids[to];
    if (from < 0 || other == null) return;
    ids[to] = id;
    ids[from] = other;
    setError(null);
    reorder.mutate(ids);
  };

  return (
    <section aria-labelledby="programmes-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 id="programmes-heading" className="text-lg font-semibold">
            Programmes
          </h2>
          <p className="text-muted-foreground text-sm">
            What a Child is admitted to. The same for every Centre.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {archivedCount === 0 ? null : (
            <div className="flex items-center gap-2">
              <Switch
                id="programmes-show-archived"
                checked={showArchived}
                onCheckedChange={(checked) => {
                  setShowArchived(checked);
                }}
              />
              <Label htmlFor="programmes-show-archived">
                Show archived ({archivedCount})
              </Label>
            </div>
          )}
          <Button
            type="button"
            onClick={() => {
              setEditing("new");
            }}
          >
            <Plus aria-hidden="true" />
            Add Programme
          </Button>
        </div>
      </div>
      <FormAlert message={error ?? undefined} />
      {shown.length === 0 ? (
        <EmptyState
          className="border"
          size="md"
          icon={BookOpenTextIcon}
          tone="amber"
          title="No Programmes yet"
          description="Add Playgroup, Nursery, LKG, UKG or Daycare to admit Children to."
        />
      ) : (
        <ol className="divide-y rounded-xl border">
          {shown.map((programme) => {
            const index = active.indexOf(programme);
            return (
              <li
                key={programme.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {programme.name}
                    {programme.isDaycare ? (
                      <Badge variant="secondary">Daycare</Badge>
                    ) : null}
                    {programme.isArchived ? (
                      <Badge variant="outline">Archived</Badge>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {ageRangeLabel(
                      programme.minAgeMonths,
                      programme.maxAgeMonths,
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {programme.isArchived ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setError(null);
                        restore.mutate(programme.id);
                      }}
                    >
                      Restore
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${programme.name} up`}
                        disabled={busy || index <= 0}
                        onClick={() => {
                          move(programme.id, -1);
                        }}
                      >
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${programme.name} down`}
                        disabled={busy || index >= active.length - 1}
                        onClick={() => {
                          move(programme.id, 1);
                        }}
                      >
                        <ArrowDown aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${programme.name}`}
                        onClick={() => {
                          setEditing(programme);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Archive ${programme.name}`}
                        disabled={busy}
                        onClick={() => {
                          setError(null);
                          archive.mutate(programme.id);
                        }}
                      >
                        Archive
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <ProgrammeFormDialog
        open={editing != null}
        programme={editing === "new" ? null : editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSubmit={async (input) => {
          await save.mutateAsync(input);
        }}
      />
    </section>
  );
}
