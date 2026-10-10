"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Building2, MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";

import { FormAlert } from "@/components/auth/form-alert";
import { ConfirmDeleteDialog } from "@/components/masters/master-list-parts";
import { PHASE_NAME_MAX, nextPhaseName } from "@/src/projects/domain/phase";
import { wingTypeLabel } from "@/src/projects/domain/wing-generator";
import {
  useDeleteWing,
  usePhaseCommand,
  wingsQuery,
  type PhaseWithWings,
  type WingSummary,
} from "@/src/queries/project-structure";

import { NameDialog } from "./name-dialog";
import {
  SectionHeader,
  StructureEmpty,
  saveProblem,
  wingPath,
  wingsPath,
} from "./structure-parts";
import { structureTotals, wingRowTotals } from "./wing-editor-state";

/** What a Team Member may do here; reading is a given on this screen. */
export type WingsAccess = {
  create: boolean;
  update: boolean;
  delete: boolean;
};

function WingRow({
  projectId,
  wing,
  access,
  onDelete,
}: {
  projectId: string;
  wing: WingSummary;
  access: WingsAccess;
  onDelete: (wing: WingSummary) => void;
}) {
  const router = useRouter();
  const href = wingPath(projectId, wing.id);
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className="block truncate font-medium hover:underline"
        >
          {wing.name}
        </Link>
        <p className="text-muted-foreground truncate text-sm tabular-nums">
          {wingTypeLabel(wing.type)} · {wingRowTotals(wing.type, wing)}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${wing.name}`}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onClick={() => {
              router.push(href);
            }}
          >
            View chart
          </DropdownMenuItem>
          {access.update ? (
            <DropdownMenuItem
              onClick={() => {
                router.push(`${href}/edit`);
              }}
            >
              Edit Wing
            </DropdownMenuItem>
          ) : null}
          {access.delete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  onDelete(wing);
                }}
              >
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

type PhaseDialogState =
  { kind: "create" } | { kind: "rename"; phase: PhaseWithWings } | null;

/**
 * The Wings screen (CM-402): the Project's Phases in order, each with its
 * Wings and their floor and unit totals, and the Project's totals. Add
 * Phase, rename and delete (only an empty Phase) and Add Wing follow the
 * `projects.wings` flags.
 */
export function WingsPage({
  projectId,
  access,
}: {
  projectId: string;
  access: WingsAccess;
}) {
  const { data } = useSuspenseQuery(wingsQuery(projectId));
  const phases = usePhaseCommand(projectId);
  const removeWing = useDeleteWing(projectId);
  const [phaseDialog, setPhaseDialog] = useState<PhaseDialogState>(null);
  const [deletingWing, setDeletingWing] = useState<WingSummary | null>(null);
  const [deletingPhase, setDeletingPhase] = useState<PhaseWithWings | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const base = wingsPath(projectId);

  const addWing = (phaseId?: string) => (
    <Link
      href={phaseId == null ? `${base}/new` : `${base}/new?phase=${phaseId}`}
      className={buttonVariants({
        variant: phaseId == null ? "default" : "outline",
        size: phaseId == null ? "default" : "sm",
      })}
    >
      <Plus aria-hidden="true" />
      Add Wing
    </Link>
  );

  const phaseNames = data.phases.map((phase) => phase.name);
  const taken = (name: string, except?: string) =>
    data.phases.some(
      (phase) =>
        phase.id !== except &&
        phase.name.toLowerCase() === name.trim().toLowerCase(),
    );

  return (
    <div className="w-full max-w-5xl space-y-6 p-6">
      <SectionHeader
        title="Wings"
        meta={data.phases.length > 0 ? structureTotals(data.totals) : undefined}
        actions={
          access.create ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPhaseDialog({ kind: "create" });
                }}
              >
                <Plus aria-hidden="true" />
                Add Phase
              </Button>
              {data.phases.length > 0 ? addWing() : null}
            </>
          ) : null
        }
      />

      {data.phases.length === 0 ? (
        <StructureEmpty
          icon={Building2}
          title={
            access.create
              ? "Set up this Project's Wings"
              : "No Wings on this Project yet"
          }
          description={
            access.create
              ? "Add a Wing — a tower, block, bungalow or plotting scheme — and its floors and units are made for you to adjust."
              : "Wings, their floors and units show here once they are set up."
          }
          action={access.create ? addWing() : undefined}
        />
      ) : (
        data.phases.map((phase) => (
          <section
            key={phase.id}
            aria-labelledby={`phase-${phase.id}`}
            className="space-y-3"
          >
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <h3 id={`phase-${phase.id}`} className="truncate font-semibold">
                  {phase.name}
                </h3>
                <p className="text-muted-foreground text-sm tabular-nums">
                  {phase.items.length === 0
                    ? "No Wings yet"
                    : structureTotals({
                        wings: phase.items.length,
                        floors: phase.floors,
                        units: phase.units,
                      })}
                </p>
              </div>
              {access.create ? addWing(phase.id) : null}
              {access.update || access.delete ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Actions for ${phase.name}`}
                      />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {access.update ? (
                      <DropdownMenuItem
                        onClick={() => {
                          setPhaseDialog({ kind: "rename", phase });
                        }}
                      >
                        Rename Phase
                      </DropdownMenuItem>
                    ) : null}
                    {access.delete ? (
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={phase.items.length > 0}
                        onClick={() => {
                          setDeleteError(undefined);
                          setDeletingPhase(phase);
                        }}
                      >
                        {phase.items.length > 0
                          ? "Delete (has Wings)"
                          : "Delete Phase"}
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
            {phase.items.length === 0 ? (
              <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-center text-sm">
                No Wings in {phase.name} yet.
              </p>
            ) : (
              <ul
                aria-label={`Wings in ${phase.name}`}
                className="bg-card divide-y rounded-xl border"
              >
                {phase.items.map((wing) => (
                  <WingRow
                    key={wing.id}
                    projectId={projectId}
                    wing={wing}
                    access={access}
                    onDelete={(item) => {
                      setDeleteError(undefined);
                      setDeletingWing(item);
                    }}
                  />
                ))}
              </ul>
            )}
          </section>
        ))
      )}

      {phaseDialog?.kind === "create" ? (
        <NameDialog
          title="Add Phase"
          description="Wings are grouped by Phase on this screen."
          label="Phase name"
          initial={nextPhaseName(phaseNames)}
          max={PHASE_NAME_MAX}
          pending={phases.isPending}
          check={(name) =>
            taken(name) ? "A Phase with this name already exists" : null
          }
          onSave={async (name) => {
            try {
              await phases.mutateAsync({ kind: "create", name });
            } catch (error) {
              throw new Error(saveProblem(error).message, { cause: error });
            }
            setPhaseDialog(null);
          }}
          onClose={() => {
            setPhaseDialog(null);
          }}
        />
      ) : null}
      {phaseDialog?.kind === "rename" ? (
        <NameDialog
          title={`Rename ${phaseDialog.phase.name}`}
          label="Phase name"
          initial={phaseDialog.phase.name}
          max={PHASE_NAME_MAX}
          pending={phases.isPending}
          check={(name) =>
            taken(name, phaseDialog.phase.id)
              ? "A Phase with this name already exists"
              : null
          }
          onSave={async (name) => {
            try {
              await phases.mutateAsync({
                kind: "rename",
                id: phaseDialog.phase.id,
                name,
                expectedUpdatedAt: phaseDialog.phase.updatedAt,
              });
            } catch (error) {
              throw new Error(saveProblem(error).message, { cause: error });
            }
            setPhaseDialog(null);
          }}
          onClose={() => {
            setPhaseDialog(null);
          }}
        />
      ) : null}
      <ConfirmDeleteDialog
        name={deletingWing?.name ?? null}
        description="The Wing goes with all its floors and units, for everyone."
        error={deleteError}
        pending={removeWing.isPending}
        onClose={() => {
          setDeletingWing(null);
        }}
        onConfirm={() => {
          if (deletingWing == null) return;
          removeWing.mutate(deletingWing.id, {
            onSuccess: () => {
              setDeletingWing(null);
            },
            onError: (error) => {
              setDeleteError(saveProblem(error).message);
            },
          });
        }}
      />
      <ConfirmDeleteDialog
        name={deletingPhase?.name ?? null}
        description="The Phase has no Wings; it goes for everyone."
        error={deleteError}
        pending={phases.isPending}
        onClose={() => {
          setDeletingPhase(null);
        }}
        onConfirm={() => {
          if (deletingPhase == null) return;
          phases.mutate(
            { kind: "delete", id: deletingPhase.id },
            {
              onSuccess: () => {
                setDeletingPhase(null);
              },
              onError: (error) => {
                setDeleteError(saveProblem(error).message);
              },
            },
          );
        }}
      />
      {phases.isError && phaseDialog == null && deletingPhase == null ? (
        <FormAlert message={saveProblem(phases.error).message} />
      ) : null}
    </div>
  );
}
