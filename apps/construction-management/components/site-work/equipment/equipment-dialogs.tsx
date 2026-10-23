"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { RadioGroup } from "@repo/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  isRupees,
  MoneyInput,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import { localToday } from "@/components/procurement/inventory/inventory-format";
import {
  equipmentFormOptionsQuery,
  useMaintenanceAction,
  useOpenMaintenance,
  useTransferEquipment,
  type EquipmentDetail,
} from "@/src/queries/equipment";
import { QueryHttpError } from "@/src/queries/http";
import { WAREHOUSE_LABEL } from "@/src/site-work/domain/equipment";
import {
  MAINTENANCE_KIND_LABELS,
  MAINTENANCE_KINDS,
} from "@/src/site-work/domain/equipment-lifecycle";

import { RadioCard } from "./radio-card";

type Maintenance = EquipmentDetail["maintenance"][number];

const DIALOG = "flex max-h-[92vh] flex-col sm:max-w-3xl";
const BODY = "min-h-0 flex-1 space-y-4 overflow-y-auto px-0.5";

/** A server refusal on a field, else the dialog's own alert. */
function serverError(
  caught: unknown,
  fields: readonly string[],
): { field: string | null; message: string } {
  if (caught instanceof QueryHttpError) {
    const field = (caught.details as { field?: unknown } | undefined)?.field;
    return {
      field: typeof field === "string" && fields.includes(field) ? field : null,
      message: caught.message,
    };
  }
  return { field: null, message: "Something went wrong. Please try again." };
}

function optional(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

// ---------------------------------------------------------------------------
// Transfer
// ---------------------------------------------------------------------------

const transferSchema = z
  .object({
    kind: z.enum(["to_project", "to_warehouse"]),
    toProjectId: z.string(),
    movementDate: z.string().min(1, "Choose the transfer date."),
    locationName: z
      .string()
      .trim()
      .min(1, "Enter where it is kept.")
      .max(120, "Use at most 120 characters."),
    remark: z.string().max(500, "Use at most 500 characters."),
  })
  .refine(
    (value) => value.kind === "to_warehouse" || value.toProjectId !== "",
    {
      path: ["toProjectId"],
      message: "Choose the Project it goes to.",
    },
  );
type TransferValues = z.infer<typeof transferSchema>;

/**
 * Transfer to Project / Transfer to Warehouse (CM-0016 §11): a date no
 * earlier than its last movement, the destination, a location name and a
 * remark. The movement history is the Transfer Report.
 */
export function TransferDialog({
  equipment,
  open,
  onClose,
}: {
  equipment: EquipmentDetail;
  open: boolean;
  onClose: () => void;
}) {
  const { data: options } = useQuery({
    ...equipmentFormOptionsQuery(),
    enabled: open,
  });
  const transfer = useTransferEquipment(equipment.id);
  const [formError, setFormError] = useState<string | undefined>();
  const atWarehouse = equipment.currentProject == null;
  const lastMovement = equipment.movements.at(-1)?.movementDate;
  const form = useForm<TransferValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      kind: "to_project",
      toProjectId: "",
      movementDate: localToday(),
      locationName: "",
      remark: "",
    },
  });
  const kind = useWatch({ control: form.control, name: "kind" });
  const errors = form.formState.errors;
  const projects = (options?.projects ?? [])
    .filter((project) => project.id !== equipment.currentProject?.id)
    .map((project) => ({ value: project.id, label: project.name }));
  const from =
    equipment.currentProject?.name ??
    (atWarehouse ? WAREHOUSE_LABEL : "its Project");

  const submit = async (values: TransferValues) => {
    setFormError(undefined);
    try {
      await transfer.mutateAsync({
        expectedUpdatedAt: equipment.updatedAt,
        kind: values.kind,
        toProjectId: values.kind === "to_project" ? values.toProjectId : null,
        movementDate: values.movementDate,
        locationName: values.locationName.trim(),
        remark: optional(values.remark),
      });
      form.reset();
      onClose();
    } catch (caught) {
      const { field, message } = serverError(caught, [
        "toProjectId",
        "movementDate",
        "locationName",
      ]);
      if (field != null)
        form.setError(field as keyof TransferValues, { message });
      else setFormError(message);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className={DIALOG}>
        <DialogHeader>
          <DialogTitle>Transfer {equipment.name}</DialogTitle>
          <DialogDescription>
            From {from}. Effect on tracking: from the transfer date it leaves{" "}
            {from}&apos;s Equipment list and takes usage sheets only where it
            goes.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          aria-label="Transfer equipment"
          className={BODY}
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit(submit)(event);
          }}
        >
          <Controller
            control={form.control}
            name="kind"
            render={({ field }) => (
              <RadioGroup
                aria-label="Transfer to"
                aria-required
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value as TransferValues["kind"]);
                }}
                className="grid gap-2 sm:grid-cols-2"
              >
                <RadioCard
                  value="to_project"
                  title="Transfer to Project"
                  onSelect={(value) => {
                    field.onChange(value);
                  }}
                />
                <RadioCard
                  value="to_warehouse"
                  title="Transfer to Warehouse"
                  hint={atWarehouse ? "It is already there." : undefined}
                  disabled={atWarehouse}
                  onSelect={(value) => {
                    field.onChange(value);
                  }}
                />
              </RadioGroup>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="transfer-date" required>
                Transfer Date
              </Label>
              <Input
                id="transfer-date"
                type="date"
                aria-required
                min={lastMovement}
                max={localToday()}
                aria-invalid={errors.movementDate != null}
                {...form.register("movementDate")}
              />
              <FieldError message={errors.movementDate?.message} />
            </div>
            {kind === "to_project" && (
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="transfer-project" required>
                  Destination Project
                </Label>
                <Controller
                  control={form.control}
                  name="toProjectId"
                  render={({ field }) => (
                    <Select
                      items={projects}
                      value={field.value === "" ? null : field.value}
                      onValueChange={(value) => {
                        if (value != null) field.onChange(value);
                      }}
                    >
                      <SelectTrigger
                        id="transfer-project"
                        className="w-full min-w-0"
                        aria-required
                        aria-invalid={errors.toProjectId != null}
                      >
                        <SelectValue placeholder="Choose a Project" />
                      </SelectTrigger>
                      <SelectContent align="start" alignItemWithTrigger={false}>
                        {projects.map((project) => (
                          <SelectItem key={project.value} value={project.value}>
                            {project.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError message={errors.toProjectId?.message} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="transfer-location" required>
                Location Name
              </Label>
              <Input
                id="transfer-location"
                autoComplete="off"
                aria-required
                placeholder={
                  kind === "to_project" ? "Block C yard" : "Ambattur godown"
                }
                aria-invalid={errors.locationName != null}
                {...form.register("locationName")}
              />
              <FieldError message={errors.locationName?.message} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="transfer-remark">Remark</Label>
              <Textarea
                id="transfer-remark"
                rows={2}
                aria-invalid={errors.remark != null}
                {...form.register("remark")}
              />
              <FieldError message={errors.remark?.message} />
            </div>
          </div>
          <FormAlert message={formError} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={transfer.isPending}>
              {transfer.isPending ? "Transferring…" : "Transfer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

const costField = z
  .string()
  .refine(
    (value) => value.trim() === "" || isRupees(value),
    "Enter an amount in rupees.",
  );

const maintenanceSchema = z.object({
  kind: z.enum(MAINTENANCE_KINDS),
  startDate: z.string().min(1, "Choose the start date."),
  endDate: z.string(),
  workshop: z.string().trim().max(120, "Use at most 120 characters."),
  description: z.string().max(500, "Use at most 500 characters."),
  cost: costField,
  remark: z.string().max(500, "Use at most 500 characters."),
});
type MaintenanceValues = z.infer<typeof maintenanceSchema>;

const KIND_ITEMS = MAINTENANCE_KINDS.map((kind) => ({
  value: kind,
  label: MAINTENANCE_KIND_LABELS[kind],
}));

/**
 * Log Maintenance (a new open entry), or edit an entry. While an entry is
 * open the equipment is in maintenance: it does not move and takes no
 * usage sheet. The cost shows with Financial on Equipments.
 */
export function MaintenanceDialog({
  equipment,
  entry,
  open,
  onClose,
}: {
  equipment: EquipmentDetail;
  /** Edit this entry; absent to log a new one. */
  entry?: Maintenance;
  open: boolean;
  onClose: () => void;
}) {
  const openEntry = useOpenMaintenance(equipment.id);
  const action = useMaintenanceAction(equipment.id);
  const seeCosts = equipment.actions.seeCosts;
  const [formError, setFormError] = useState<string | undefined>();
  const form = useForm<MaintenanceValues>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: {
      kind: entry?.kind ?? "breakdown",
      startDate: entry?.startDate ?? localToday(),
      endDate: entry?.endDate ?? "",
      workshop: entry?.workshop ?? "",
      description: entry?.description ?? "",
      cost: paiseToRupees(entry?.cost),
      remark: entry?.remark ?? "",
    },
  });
  const errors = form.formState.errors;
  const closed = entry?.endDate != null;
  const pending = openEntry.isPending || action.isPending;

  const submit = async (values: MaintenanceValues) => {
    setFormError(undefined);
    const cost = seeCosts ? { cost: rupeesToPaise(values.cost) } : {};
    try {
      if (entry == null)
        await openEntry.mutateAsync({
          expectedUpdatedAt: equipment.updatedAt,
          kind: values.kind,
          startDate: values.startDate,
          workshop: optional(values.workshop),
          description: optional(values.description),
          ...cost,
        });
      else
        await action.mutateAsync({
          action: "update",
          maintenanceId: entry.id,
          body: {
            expectedUpdatedAt: equipment.updatedAt,
            kind: values.kind,
            startDate: values.startDate,
            endDate: closed ? values.endDate : null,
            workshop: optional(values.workshop),
            description: optional(values.description),
            remark: optional(values.remark),
            ...cost,
          },
        });
      onClose();
    } catch (caught) {
      const { field, message } = serverError(caught, [
        "startDate",
        "endDate",
        "workshop",
        "cost",
      ]);
      if (field != null)
        form.setError(field as keyof MaintenanceValues, { message });
      else setFormError(message);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className={DIALOG}>
        <DialogHeader>
          <DialogTitle>
            {entry == null ? "Log Maintenance" : "Edit maintenance"}
          </DialogTitle>
          <DialogDescription>
            {entry == null
              ? `${equipment.name} goes into maintenance from the start date: it cannot be transferred or take usage sheets until it returns to service.`
              : `${equipment.name}, ${MAINTENANCE_KIND_LABELS[entry.kind]} from ${entry.startDate}.`}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          aria-label={entry == null ? "Log Maintenance" : "Edit maintenance"}
          className={BODY}
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit(submit)(event);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="maintenance-kind" required>
                Kind
              </Label>
              <Controller
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <Select
                    items={KIND_ITEMS}
                    value={field.value}
                    onValueChange={(value) => {
                      if (value != null) field.onChange(value);
                    }}
                  >
                    <SelectTrigger
                      id="maintenance-kind"
                      className="w-full min-w-0"
                      aria-required
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      {KIND_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maintenance-start" required>
                Start Date
              </Label>
              <Input
                id="maintenance-start"
                type="date"
                aria-required
                max={localToday()}
                aria-invalid={errors.startDate != null}
                {...form.register("startDate")}
              />
              <FieldError message={errors.startDate?.message} />
            </div>
            {closed && (
              <div className="space-y-1.5">
                <Label htmlFor="maintenance-end" required>
                  Returned on
                </Label>
                <Input
                  id="maintenance-end"
                  type="date"
                  aria-required
                  max={localToday()}
                  aria-invalid={errors.endDate != null}
                  {...form.register("endDate")}
                />
                <FieldError message={errors.endDate?.message} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="maintenance-workshop">Workshop</Label>
              <Input
                id="maintenance-workshop"
                autoComplete="off"
                aria-invalid={errors.workshop != null}
                {...form.register("workshop")}
              />
              <FieldError message={errors.workshop?.message} />
            </div>
            {seeCosts && (
              <div className="space-y-1.5">
                <Label htmlFor="maintenance-cost">Cost</Label>
                <MoneyInput
                  id="maintenance-cost"
                  aria-invalid={errors.cost != null}
                  {...form.register("cost")}
                />
                <FieldError message={errors.cost?.message} />
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="maintenance-description">Description</Label>
              <Textarea
                id="maintenance-description"
                rows={2}
                aria-invalid={errors.description != null}
                {...form.register("description")}
              />
              <FieldError message={errors.description?.message} />
            </div>
            {entry != null && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="maintenance-remark">Remark</Label>
                <Textarea
                  id="maintenance-remark"
                  rows={2}
                  aria-invalid={errors.remark != null}
                  {...form.register("remark")}
                />
                <FieldError message={errors.remark?.message} />
              </div>
            )}
          </div>
          <FormAlert message={formError} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : entry == null ? "Log Maintenance" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const returnSchema = z.object({
  endDate: z.string().min(1, "Choose the date it returned to service."),
  cost: costField,
  remark: z.string().max(500, "Use at most 500 characters."),
});
type ReturnValues = z.infer<typeof returnSchema>;

/** Return to Service: closes the open entry with an end date, the final cost and a remark. */
export function ReturnToServiceDialog({
  equipment,
  open,
  onClose,
}: {
  equipment: EquipmentDetail;
  open: boolean;
  onClose: () => void;
}) {
  const action = useMaintenanceAction(equipment.id);
  const entry = equipment.maintenance.find(
    (item) => item.id === equipment.openMaintenance?.id,
  );
  const seeCosts = equipment.actions.seeCosts;
  const [formError, setFormError] = useState<string | undefined>();
  const form = useForm<ReturnValues>({
    resolver: zodResolver(returnSchema),
    defaultValues: {
      endDate: localToday(),
      cost: paiseToRupees(entry?.cost),
      remark: "",
    },
  });
  const errors = form.formState.errors;
  if (entry == null) return null;

  const submit = async (values: ReturnValues) => {
    setFormError(undefined);
    try {
      await action.mutateAsync({
        action: "close",
        maintenanceId: entry.id,
        body: {
          expectedUpdatedAt: equipment.updatedAt,
          endDate: values.endDate,
          remark: optional(values.remark),
          ...(seeCosts ? { cost: rupeesToPaise(values.cost) } : {}),
        },
      });
      onClose();
    } catch (caught) {
      const { field, message } = serverError(caught, ["endDate", "cost"]);
      if (field != null)
        form.setError(field as keyof ReturnValues, { message });
      else setFormError(message);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className={DIALOG}>
        <DialogHeader>
          <DialogTitle>Return to Service</DialogTitle>
          <DialogDescription>
            {equipment.name} has been in maintenance (
            {MAINTENANCE_KIND_LABELS[entry.kind]}) since {entry.startDate}.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          aria-label="Return to Service"
          className={BODY}
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit(submit)(event);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="return-date" required>
                Returned on
              </Label>
              <Input
                id="return-date"
                type="date"
                aria-required
                min={entry.startDate}
                max={localToday()}
                aria-invalid={errors.endDate != null}
                {...form.register("endDate")}
              />
              <FieldError message={errors.endDate?.message} />
            </div>
            {seeCosts && (
              <div className="space-y-1.5">
                <Label htmlFor="return-cost">Final Cost</Label>
                <MoneyInput
                  id="return-cost"
                  aria-invalid={errors.cost != null}
                  {...form.register("cost")}
                />
                <FieldError message={errors.cost?.message} />
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="return-remark">Remark</Label>
              <Textarea
                id="return-remark"
                rows={2}
                aria-invalid={errors.remark != null}
                {...form.register("remark")}
              />
              <FieldError message={errors.remark?.message} />
            </div>
          </div>
          <FormAlert message={formError} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={action.isPending}>
              {action.isPending ? "Saving…" : "Return to Service"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
