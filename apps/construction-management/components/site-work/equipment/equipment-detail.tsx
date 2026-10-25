"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  CircleOff,
  MoreHorizontal,
  Pencil,
  TriangleAlert,
  Truck,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
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
  PageHeader,
  type PageHeaderBack,
} from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { ConfirmDeleteDialog } from "@/components/masters/master-list-parts";
import { formatPaise } from "@/components/money/money-input";
import { formatDate } from "@/components/procurement/inventory/inventory-format";
import {
  equipmentQuery,
  useDeleteEquipment,
  useMaintenanceAction,
  useSetEquipmentAvailability,
  type EquipmentDetail,
} from "@/src/queries/equipment";
import { QueryHttpError } from "@/src/queries/http";
import {
  FUEL_TYPE_LABELS,
  FUEL_UNIT_LABELS,
  OWNERSHIP_LABELS,
  UTILISATION_BASIS_LABELS,
  WAREHOUSE_LABEL,
  WORKING_TIME_METHOD_LABELS,
} from "@/src/site-work/domain/equipment";
import {
  MAINTENANCE_KIND_LABELS,
  MOVEMENT_KIND_LABELS,
} from "@/src/site-work/domain/equipment-lifecycle";

import {
  MaintenanceDialog,
  ReturnToServiceDialog,
  TransferDialog,
} from "./equipment-dialogs";
import {
  efficiencyLabel,
  EquipmentStateBadge,
  hireBasisLabel,
  hireRateLabel,
  placeLabel,
  targetLabel,
  unavailableBanner,
} from "./equipment-format";

type Maintenance = EquipmentDetail["maintenance"][number];

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words">{children ?? "—"}</dd>
    </div>
  );
}

function person(value: { name: string | null }): string {
  return value.name ?? "A former member";
}

function errorMessage(caught: unknown): string {
  return caught instanceof QueryHttpError
    ? caught.message
    : "Something went wrong. Please try again.";
}

/** The Transfer Report of `modules/04`: one row per placement or transfer. */
function MovementHistory({ equipment }: { equipment: EquipmentDetail }) {
  const rows = [...equipment.movements].reverse();
  return (
    <section aria-labelledby="movement-history" className="space-y-3">
      <h2 id="movement-history" className="text-base font-semibold">
        Movement history
      </h2>
      <div
        role="region"
        aria-label="Movement history, scrolls sideways"
        tabIndex={0}
        className="bg-card focus-visible:ring-ring/50 overflow-x-auto rounded-lg border outline-none focus-visible:ring-3"
      >
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
            <tr>
              <th className="px-3 py-2 font-medium">Transfer Date</th>
              <th className="px-3 py-2 font-medium">Location Before</th>
              <th className="px-3 py-2 font-medium">Transfer To Project</th>
              <th className="px-3 py-2 font-medium">Latest Location</th>
              <th className="px-3 py-2 font-medium">Remarks</th>
              <th className="px-3 py-2 font-medium">Entry By</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((movement) => (
              <tr key={movement.id} className="align-top">
                <td className="px-3 py-2 whitespace-nowrap">
                  {formatDate(movement.movementDate)}
                  <span className="text-muted-foreground block text-xs">
                    {MOVEMENT_KIND_LABELS[movement.kind]}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {movement.before == null
                    ? "—"
                    : [
                        movement.before.project == null
                          ? WAREHOUSE_LABEL
                          : (movement.before.project.name ??
                            "A removed Project"),
                        movement.before.locationName,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </td>
                <td className="px-3 py-2">
                  {movement.toProject == null
                    ? WAREHOUSE_LABEL
                    : (movement.toProject.name ?? "A removed Project")}
                </td>
                <td className="px-3 py-2">{movement.locationName}</td>
                <td className="px-3 py-2">{movement.remark ?? "—"}</td>
                <td className="px-3 py-2">{person(movement.createdBy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MaintenanceLog({
  equipment,
  onReturn,
  onEdit,
  onDelete,
}: {
  equipment: EquipmentDetail;
  onReturn: () => void;
  onEdit: (entry: Maintenance) => void;
  onDelete: (entry: Maintenance) => void;
}) {
  const { seeCosts, editMaintenance, returnToService } = equipment.actions;
  return (
    <section aria-labelledby="maintenance-log" className="space-y-3">
      <h2 id="maintenance-log" className="text-base font-semibold">
        Maintenance log
      </h2>
      {equipment.maintenance.length === 0 ? (
        <p className="bg-card text-muted-foreground rounded-lg border p-4 text-sm">
          No maintenance logged yet.
        </p>
      ) : (
        <ul
          className="bg-card divide-y rounded-lg border"
          aria-label="Maintenance log"
        >
          {equipment.maintenance.map((entry) => {
            const open = entry.endDate == null;
            return (
              <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {MAINTENANCE_KIND_LABELS[entry.kind]}
                    {open ? <Badge variant="destructive">Open</Badge> : null}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {formatDate(entry.startDate)} –{" "}
                    {open
                      ? "now"
                      : formatDate(entry.endDate ?? entry.startDate)}
                    {entry.workshop == null ? "" : ` · ${entry.workshop}`}
                    {seeCosts && entry.cost != null
                      ? ` · ${formatPaise(entry.cost)}`
                      : ""}
                  </p>
                  {entry.description == null ? null : (
                    <p className="text-sm break-words">{entry.description}</p>
                  )}
                  {entry.remark == null ? null : (
                    <p className="text-muted-foreground text-sm break-words">
                      {entry.remark}
                    </p>
                  )}
                </div>
                {editMaintenance && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${MAINTENANCE_KIND_LABELS[entry.kind]} from ${entry.startDate}`}
                        />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {open && returnToService ? (
                        <DropdownMenuItem onClick={onReturn}>
                          Return to Service
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem
                        onClick={() => {
                          onEdit(entry);
                        }}
                      >
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          onDelete(entry);
                        }}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

type DialogState =
  | { kind: "transfer" }
  | { kind: "log" }
  | { kind: "return" }
  | { kind: "edit"; entry: Maintenance }
  | { kind: "delete-entry"; entry: Maintenance }
  | { kind: "delete" }
  | null;

/** The detail page's body for a loaded machine (stories render it directly). */
export function EquipmentDetailView({
  equipment,
  back,
  editHref,
  afterDeleteHref,
  photoFailed = false,
}: {
  equipment: EquipmentDetail;
  back: PageHeaderBack;
  editHref: string;
  afterDeleteHref: string;
  /** The machine saved but its photo did not upload (`?photoFailed=1`). */
  photoFailed?: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [error, setError] = useState<string | undefined>();
  const availability = useSetEquipmentAvailability(equipment.id);
  const remove = useDeleteEquipment(equipment.id);
  const maintenance = useMaintenanceAction(equipment.id);
  const { actions } = equipment;
  const close = () => {
    setDialog(null);
    setError(undefined);
  };

  const menu =
    actions.transfer ||
    actions.logMaintenance ||
    actions.returnToService ||
    actions.changeAvailability ||
    actions.delete ? (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="outline" aria-label="More actions" />
          }
        >
          <MoreHorizontal />
          Actions
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {actions.transfer ? (
            <DropdownMenuItem
              onClick={() => {
                setDialog({ kind: "transfer" });
              }}
            >
              <ArrowRightLeft aria-hidden="true" />
              Transfer
            </DropdownMenuItem>
          ) : null}
          {actions.logMaintenance ? (
            <DropdownMenuItem
              onClick={() => {
                setDialog({ kind: "log" });
              }}
            >
              <Wrench aria-hidden="true" />
              Log Maintenance
            </DropdownMenuItem>
          ) : null}
          {actions.returnToService ? (
            <DropdownMenuItem
              onClick={() => {
                setDialog({ kind: "return" });
              }}
            >
              <Wrench aria-hidden="true" />
              Return to Service
            </DropdownMenuItem>
          ) : null}
          {actions.changeAvailability ? (
            <DropdownMenuItem
              onClick={() => {
                setError(undefined);
                availability.mutate(
                  {
                    expectedUpdatedAt: equipment.updatedAt,
                    available: !equipment.availableForEntry,
                  },
                  {
                    onError: (caught) => {
                      setError(errorMessage(caught));
                    },
                  },
                );
              }}
            >
              <CircleOff aria-hidden="true" />
              {equipment.availableForEntry
                ? "Mark unavailable for worksheet entry"
                : "Make it available for worksheet entry"}
            </DropdownMenuItem>
          ) : null}
          {actions.delete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  setDialog({ kind: "delete" });
                }}
              >
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={back}
          title={equipment.name}
          meta={`${equipment.equipmentNumber} · ${OWNERSHIP_LABELS[equipment.ownership]}`}
          leading={
            equipment.photo == null ? (
              <span className="bg-muted text-muted-foreground flex size-14 shrink-0 items-center justify-center rounded-lg">
                <Truck aria-hidden="true" />
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- a private, signed-in route
              <img
                src={equipment.photo.thumbnailUrl}
                alt=""
                className="bg-card size-14 shrink-0 rounded-lg border object-cover"
              />
            )
          }
          actions={
            <>
              {actions.edit ? (
                <Link
                  href={editHref}
                  className={buttonVariants({ variant: "outline" })}
                >
                  <Pencil aria-hidden="true" />
                  Edit
                </Link>
              ) : null}
              {menu}
            </>
          }
        />

        {!equipment.availableForEntry && equipment.unavailableSince != null ? (
          <Alert>
            <CircleOff aria-hidden="true" />
            <AlertTitle>
              {unavailableBanner(equipment.unavailableSince)}
            </AlertTitle>
            <AlertDescription>
              It takes no usage sheet until it is made available again.
            </AlertDescription>
          </Alert>
        ) : null}
        {equipment.openMaintenance != null ? (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>
              In maintenance since{" "}
              {formatDate(equipment.openMaintenance.startDate)}
            </AlertTitle>
            <AlertDescription>
              {MAINTENANCE_KIND_LABELS[equipment.openMaintenance.kind]}. It
              cannot be transferred or take usage sheets until it returns to
              service.
            </AlertDescription>
          </Alert>
        ) : null}
        <FormAlert
          message={
            error ??
            (photoFailed
              ? "The equipment was saved, but the photo did not upload. Add it again on Edit."
              : undefined)
          }
        />

        <dl className="bg-card grid gap-4 rounded-xl border p-4 sm:grid-cols-3 sm:p-5">
          <Fact label="Where it is">{placeLabel(equipment)}</Fact>
          <Fact label="State">
            <EquipmentStateBadge state={equipment.state} />
          </Fact>
          <Fact label="Purchase Year">
            {equipment.purchaseYear == null
              ? null
              : String(equipment.purchaseYear)}
          </Fact>
          <Fact label="Utilisation">
            {UTILISATION_BASIS_LABELS[equipment.utilisationBasis]} ·{" "}
            {WORKING_TIME_METHOD_LABELS[equipment.workingTimeMethod]}
          </Fact>
          <Fact label="Fuel">
            {[
              equipment.fuelType == null
                ? null
                : FUEL_TYPE_LABELS[equipment.fuelType],
              equipment.fuelUnit == null
                ? null
                : FUEL_UNIT_LABELS[equipment.fuelUnit],
            ]
              .filter(Boolean)
              .join(" · ") || null}
          </Fact>
          <Fact label="Target">{targetLabel(equipment)}</Fact>
          <Fact label="Min Utilisation">
            {equipment.minUtilisationPct == null
              ? null
              : `${String(Number(equipment.minUtilisationPct))}%`}
          </Fact>
          <Fact label="Expected Fuel Efficiency">
            {efficiencyLabel(equipment)}
          </Fact>
          <Fact label="Contact">
            {[equipment.contactPersonName, equipment.contactPersonNumber]
              .filter(Boolean)
              .join(" · ") || null}
          </Fact>
          <Fact label="Company Name">{equipment.companyName}</Fact>
          {equipment.ownership === "rented" ? (
            <>
              <Fact label="Hired from">
                {equipment.hireParty?.name ?? null}
              </Fact>
              <Fact label="Hire Basis">{hireBasisLabel(equipment)}</Fact>
              {actions.seeRates ? (
                <Fact label="Rate">{hireRateLabel(equipment)}</Fact>
              ) : null}
              <Fact label="Chargeable">
                {equipment.idleChargeable
                  ? "Idle hours are billed"
                  : "Idle hours are not billed"}
              </Fact>
            </>
          ) : null}
        </dl>

        <MovementHistory equipment={equipment} />
        <MaintenanceLog
          equipment={equipment}
          onReturn={() => {
            setDialog({ kind: "return" });
          }}
          onEdit={(entry) => {
            setDialog({ kind: "edit", entry });
          }}
          onDelete={(entry) => {
            setDialog({ kind: "delete-entry", entry });
          }}
        />
      </div>

      {dialog?.kind === "transfer" && (
        <TransferDialog equipment={equipment} open onClose={close} />
      )}
      {dialog?.kind === "log" && (
        <MaintenanceDialog equipment={equipment} open onClose={close} />
      )}
      {dialog?.kind === "edit" && (
        <MaintenanceDialog
          equipment={equipment}
          entry={dialog.entry}
          open
          onClose={close}
        />
      )}
      {dialog?.kind === "return" && (
        <ReturnToServiceDialog equipment={equipment} open onClose={close} />
      )}
      <ConfirmDeleteDialog
        name={
          dialog?.kind === "delete-entry"
            ? `${MAINTENANCE_KIND_LABELS[dialog.entry.kind]} from ${formatDate(dialog.entry.startDate)}`
            : null
        }
        description="It leaves the maintenance log. If it is the open entry, the equipment returns to service."
        error={error}
        pending={maintenance.isPending}
        onClose={close}
        onConfirm={() => {
          if (dialog?.kind !== "delete-entry") return;
          maintenance.mutate(
            {
              action: "delete",
              maintenanceId: dialog.entry.id,
              body: { expectedUpdatedAt: equipment.updatedAt },
            },
            {
              onSuccess: close,
              onError: (caught) => {
                setError(errorMessage(caught));
              },
            },
          );
        }}
      />
      <ConfirmDeleteDialog
        name={dialog?.kind === "delete" ? equipment.name : null}
        description="It leaves the register. Equipment with usage sheets cannot be deleted."
        error={error}
        pending={remove.isPending}
        onClose={close}
        onConfirm={() => {
          remove.mutate(equipment.updatedAt, {
            onSuccess: () => {
              router.push(afterDeleteHref);
            },
            onError: (caught) => {
              setError(errorMessage(caught));
            },
          });
        }}
      />
    </div>
  );
}

/** An equipment detail page: loads the machine, then the view. */
export function EquipmentDetailScreen({
  id,
  back,
  editHref,
  afterDeleteHref,
}: {
  id: string;
  back: PageHeaderBack;
  editHref: string;
  afterDeleteHref: string;
}) {
  const { data } = useSuspenseQuery(equipmentQuery(id));
  const photoFailed = useSearchParams().get("photoFailed") === "1";
  return (
    <EquipmentDetailView
      equipment={data}
      back={back}
      editHref={editHref}
      afterDeleteHref={afterDeleteHref}
      photoFailed={photoFailed}
    />
  );
}
