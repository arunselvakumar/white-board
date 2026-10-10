"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";

import { ConfirmDeleteDialog } from "@/components/masters/master-list-parts";
import {
  wingLayout,
  wingTypeLabel,
  type FloorKind,
  type WingType,
} from "@/src/projects/domain/wing-generator";
import {
  useDeleteWing,
  wingQuery,
  wingsQuery,
} from "@/src/queries/project-structure";

import { SectionHeader, saveProblem, wingsPath } from "./structure-parts";
import { editorTotals } from "./wing-editor-state";
import type { WingsAccess } from "./wings-page";

type ChartFloor = {
  id: string;
  kind: FloorKind;
  name: string;
  units: readonly { id: string; name: string }[];
};

function UnitCell({ name }: { name: string }) {
  return (
    <span className="bg-primary/10 text-foreground inline-flex h-8 min-w-14 items-center justify-center rounded-md px-2 text-sm font-medium whitespace-nowrap tabular-nums">
      {name}
    </span>
  );
}

/**
 * The wing chart (CM-402): floors top to bottom, each with its units
 * across. A tall or wide Wing scrolls inside its own frame, never the page;
 * the floor names stay in view. A scheme's plots or bungalows wrap instead.
 */
export function WingChart({
  name,
  type,
  floors,
}: {
  name: string;
  type: WingType;
  floors: readonly ChartFloor[];
}) {
  if (wingLayout(type) === "scheme") {
    const units = floors.flatMap((floor) => floor.units);
    return (
      <ul
        aria-label={`${name} chart`}
        className="bg-card flex flex-wrap gap-2 rounded-xl border p-3"
      >
        {units.map((unit) => (
          <li key={unit.id}>
            <UnitCell name={unit.name} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div
      role="region"
      aria-label={`${name} chart`}
      tabIndex={0}
      className="bg-card focus-visible:ring-ring/50 max-h-[70vh] w-full overflow-auto rounded-xl border outline-none focus-visible:ring-3"
    >
      <table className="border-separate border-spacing-0 text-sm">
        <tbody>
          {floors.map((floor) => (
            <tr key={floor.id}>
              <th
                scope="row"
                className="bg-card sticky left-0 z-10 max-w-36 truncate border-r border-b px-3 py-2 text-left font-medium whitespace-nowrap sm:max-w-48"
              >
                {floor.name}
              </th>
              {floor.units.length === 0 ? (
                <td className="text-muted-foreground border-b px-3 py-2 whitespace-nowrap">
                  No units
                </td>
              ) : (
                floor.units.map((unit) => (
                  <td key={unit.id} className="border-b p-1">
                    <UnitCell name={unit.name} />
                  </td>
                ))
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One Wing's page: its chart, with Edit and Delete by permission. */
export function WingChartScreen({
  projectId,
  wingId,
  access,
}: {
  projectId: string;
  wingId: string;
  access: WingsAccess;
}) {
  const router = useRouter();
  const { data: wing } = useSuspenseQuery(wingQuery(projectId, wingId));
  const { data: overview } = useSuspenseQuery(wingsQuery(projectId));
  const removal = useDeleteWing(projectId);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const back = wingsPath(projectId);
  const phase = overview.phases.find((item) => item.id === wing.phaseId);
  const type = wing.type;

  return (
    <div className="w-full max-w-5xl space-y-5 p-6">
      <SectionHeader
        back={{ label: "Wings", href: back }}
        title={wing.name}
        meta={[
          wingTypeLabel(type),
          phase?.name,
          editorTotals(type, wing.floors),
        ]
          .filter((part) => part != null)
          .join(" · ")}
        actions={
          <>
            {access.update ? (
              <Link
                href={`${back}/${encodeURIComponent(wing.id)}/edit`}
                className={buttonVariants({ variant: "outline" })}
              >
                <Pencil aria-hidden="true" />
                Edit Wing
              </Link>
            ) : null}
            {access.delete ? (
              <Button
                type="button"
                variant="outline"
                className="text-destructive"
                onClick={() => {
                  setDeleteError(undefined);
                  setDeleting(true);
                }}
              >
                <Trash2 aria-hidden="true" />
                Delete
              </Button>
            ) : null}
          </>
        }
      />
      <WingChart name={wing.name} type={type} floors={wing.floors} />
      <ConfirmDeleteDialog
        name={deleting ? wing.name : null}
        description="The Wing goes with all its floors and units, for everyone."
        error={deleteError}
        pending={removal.isPending}
        onClose={() => {
          setDeleting(false);
        }}
        onConfirm={() => {
          removal.mutate(wing.id, {
            onSuccess: () => {
              router.push(back);
            },
            onError: (error) => {
              setDeleteError(saveProblem(error).message);
            },
          });
        }}
      />
    </div>
  );
}
