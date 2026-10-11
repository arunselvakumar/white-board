"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  Fuel,
  Gauge,
  HandCoins,
  IdCard,
  MapPin,
  Target,
  Truck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Controller,
  useForm,
  useWatch,
  type Control,
  type FieldPath,
} from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Switch } from "@repo/ui/components/switch";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  isRupees,
  MoneyInput,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import { localToday } from "@/components/procurement/inventory/inventory-format";
import { ImageUploader } from "@/components/profile/image-uploader";
import { FormCard } from "@/components/projects/form-card";
import {
  equipmentFormOptionsQuery,
  removeEquipmentPhoto,
  uploadEquipmentPhoto,
  useCreateEquipment,
  useUpdateEquipment,
  type EquipmentDetail,
} from "@/src/queries/equipment";
import { QueryHttpError } from "@/src/queries/http";
import {
  canInSiteWork,
  siteWorkAccessQuery,
} from "@/src/queries/site-work-access";
import {
  FUEL_TYPE_LABELS,
  FUEL_TYPES,
  FUEL_UNIT_LABELS,
  FUEL_UNITS,
  HIRE_BASES,
  HIRE_BASIS_LABELS,
  OWNERSHIP_LABELS,
  TARGET_UNIT_LABELS,
  TARGET_UNITS_BY_BASIS,
  UTILISATION_BASES,
  UTILISATION_BASIS_LABELS,
  WAREHOUSE_LABEL,
  WORKING_TIME_METHOD_LABELS,
  workingTimeMethodsFor,
  type EquipmentOwnership,
} from "@/src/site-work/domain/equipment";

const WAREHOUSE = "warehouse";
const NONE = "none";
const THIS_YEAR = new Date().getFullYear();

const optionalDecimal = (scale: number, message: string) =>
  z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" ||
        new RegExp(`^\\d{1,8}(\\.\\d{1,${String(scale)}})?$`).test(value),
      message,
    );

const schema = z
  .object({
    ownership: z.enum(["owned", "rented"]),
    name: z
      .string()
      .trim()
      .min(1, "Enter the equipment name.")
      .max(120, "Use at most 120 characters."),
    equipmentNumber: z
      .string()
      .trim()
      .min(1, "Enter the equipment number.")
      .max(40, "Use at most 40 characters."),
    purchaseYear: z
      .string()
      .trim()
      .refine(
        (value) =>
          value === "" ||
          (/^\d{4}$/.test(value) &&
            Number(value) >= 1950 &&
            Number(value) <= THIS_YEAR),
        `Enter a year from 1950 to ${String(THIS_YEAR)}.`,
      ),
    fuelType: z.string(),
    fuelUnit: z.string(),
    utilisationBasis: z.enum(UTILISATION_BASES),
    workingTimeMethod: z.enum(["time_shifts", "meter_reading", "both"]),
    targetValue: optionalDecimal(
      2,
      "Enter a target more than 0, with at most 2 decimals.",
    ).refine(
      (value) => value === "" || Number(value) > 0,
      "Enter a target more than 0, with at most 2 decimals.",
    ),
    targetUnit: z.string(),
    minUtilisationPct: optionalDecimal(
      2,
      "Enter a percentage from 0 to 100.",
    ).refine(
      (value) => value === "" || Number(value) <= 100,
      "Enter a percentage from 0 to 100.",
    ),
    expectedFuelEfficiency: optionalDecimal(
      3,
      "Enter a number more than 0, with at most 3 decimals.",
    ).refine(
      (value) => value === "" || Number(value) > 0,
      "Enter a number more than 0, with at most 3 decimals.",
    ),
    contactPersonName: z
      .string()
      .trim()
      .max(120, "Use at most 120 characters."),
    contactPersonNumber: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || /^\+?[\d\s-]{6,20}$/.test(value),
        "Enter a phone number.",
      ),
    companyName: z.string().trim().max(120, "Use at most 120 characters."),
    hirePartyId: z.string(),
    hireBasis: z.string(),
    hireRate: z.string(),
    idleChargeable: z.boolean(),
    place: z.string(),
    locationName: z.string().trim().max(120, "Use at most 120 characters."),
    placedOn: z.string(),
  })
  .superRefine((value, ctx) => {
    if (
      value.workingTimeMethod === "both" &&
      value.utilisationBasis !== "hourly"
    )
      ctx.addIssue({
        code: "custom",
        path: ["workingTimeMethod"],
        message: "Both is only for Hourly equipment.",
      });
    if (value.targetValue !== "" && value.targetUnit === "")
      ctx.addIssue({
        code: "custom",
        path: ["targetUnit"],
        message: "Choose the target's unit.",
      });
    if (value.ownership !== "rented") return;
    if (value.hirePartyId === "")
      ctx.addIssue({
        code: "custom",
        path: ["hirePartyId"],
        message: "Choose the Contractor it is hired from.",
      });
    if (value.hireBasis === "")
      ctx.addIssue({
        code: "custom",
        path: ["hireBasis"],
        message: "Choose the hire basis.",
      });
  });

type Values = z.infer<typeof schema>;

const SERVER_FIELDS = new Set<string>([
  "name",
  "equipmentNumber",
  "purchaseYear",
  "workingTimeMethod",
  "targetValue",
  "targetUnit",
  "minUtilisationPct",
  "expectedFuelEfficiency",
  "contactPersonNumber",
  "hirePartyId",
  "hireBasis",
  "hireRate",
  "locationName",
  "placedOn",
]);

type PhotoChange =
  { kind: "keep" } | { kind: "set"; file: File } | { kind: "remove" };

function usePickedUrl(change: PhotoChange): string | null {
  const file = change.kind === "set" ? change.file : null;
  const url = useMemo(
    () => (file == null ? null : URL.createObjectURL(file)),
    [file],
  );
  useEffect(
    () => () => {
      if (url != null) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}

function defaultsOf(
  equipment: EquipmentDetail | undefined,
  fixedProjectId: string | null,
): Values {
  if (equipment == null)
    return {
      ownership: "owned",
      name: "",
      equipmentNumber: "",
      purchaseYear: "",
      fuelType: "",
      fuelUnit: "",
      utilisationBasis: "hourly",
      workingTimeMethod: "time_shifts",
      targetValue: "",
      targetUnit: "",
      minUtilisationPct: "",
      expectedFuelEfficiency: "",
      contactPersonName: "",
      contactPersonNumber: "",
      companyName: "",
      hirePartyId: "",
      hireBasis: "",
      hireRate: "",
      idleChargeable: false,
      place: fixedProjectId ?? "",
      locationName: "",
      placedOn: localToday(),
    };
  const trim = (value: string | null) =>
    value == null ? "" : String(Number(value));
  return {
    ownership: equipment.ownership,
    name: equipment.name,
    equipmentNumber: equipment.equipmentNumber,
    purchaseYear:
      equipment.purchaseYear == null ? "" : String(equipment.purchaseYear),
    fuelType: equipment.fuelType ?? "",
    fuelUnit: equipment.fuelUnit ?? "",
    utilisationBasis: equipment.utilisationBasis,
    workingTimeMethod: equipment.workingTimeMethod,
    targetValue: trim(equipment.targetValue),
    targetUnit: equipment.targetUnit ?? "",
    minUtilisationPct: trim(equipment.minUtilisationPct),
    expectedFuelEfficiency: trim(equipment.expectedFuelEfficiency),
    contactPersonName: equipment.contactPersonName ?? "",
    contactPersonNumber: equipment.contactPersonNumber ?? "",
    companyName: equipment.companyName ?? "",
    hirePartyId: equipment.hireParty?.id ?? "",
    hireBasis: equipment.hireBasis ?? "",
    hireRate: paiseToRupees(equipment.hireRate),
    idleChargeable: equipment.idleChargeable,
    place: equipment.currentProject?.id ?? WAREHOUSE,
    locationName: equipment.currentLocationName ?? "",
    placedOn: localToday(),
  };
}

function SelectField({
  control,
  name,
  id,
  label,
  items,
  placeholder,
  invalid,
  disabled,
}: {
  control: Control<Values>;
  name: FieldPath<Values>;
  id: string;
  label: string;
  items: { value: string; label: string }[];
  placeholder: string;
  invalid: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select
            items={items}
            value={field.value === "" ? null : (field.value as string)}
            disabled={disabled}
            onValueChange={(value) => {
              if (value != null) field.onChange(value === NONE ? "" : value);
            }}
          >
            <SelectTrigger
              id={id}
              className="w-full min-w-0"
              aria-invalid={invalid}
            >
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  );
}

function optional(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

/**
 * Add or edit equipment (CM-603, CM-0016 §10). Company owned or Rented is
 * chosen first; then Identity, Fuel, Utilisation, Target & Performance and,
 * for rented equipment, Hire details. A new machine also gets its first
 * place: a Project (fixed when added from a Project) or the warehouse. The
 * photo goes up after the save, through the attachments service.
 */
export function EquipmentForm({
  equipment,
  fixedProjectId = null,
  onSaved,
  onCancel,
}: {
  /** Edit this machine. */
  equipment?: EquipmentDetail;
  /** Added from a Project's Equipment module: it starts there. */
  fixedProjectId?: string | null;
  onSaved: (saved: EquipmentDetail) => void;
  onCancel: () => void;
}) {
  const { data: options } = useSuspenseQuery(
    equipmentFormOptionsQuery(fixedProjectId),
  );
  const { data: access } = useQuery(
    siteWorkAccessQuery(
      fixedProjectId ?? equipment?.currentProject?.id ?? null,
    ),
  );
  const seeRates =
    equipment != null
      ? equipment.actions.seeRates
      : access != null &&
        (canInSiteWork(access, "masters.equipments", "financial") ||
          (fixedProjectId != null &&
            canInSiteWork(access, "site_work.equipment_usage", "financial")));
  const canChangePhoto = equipment == null || equipment.actions.changePhoto;
  const create = useCreateEquipment();
  const update = useUpdateEquipment(equipment?.id ?? "");
  const [photo, setPhoto] = useState<PhotoChange>({ kind: "keep" });
  const pickedUrl = usePickedUrl(photo);
  const [formError, setFormError] = useState<string | undefined>();
  const [saving, setSaving] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaultsOf(equipment, fixedProjectId),
  });
  const values = useWatch({ control: form.control }) as Values;
  const errors = form.formState.errors;
  const rented = values.ownership === "rented";
  const basis = values.utilisationBasis;
  // Rented equipment needs a rate, and a rate needs Financial.
  const rentedLocked = equipment == null && !seeRates;

  useEffect(() => {
    if (!workingTimeMethodsFor(basis).includes(values.workingTimeMethod))
      form.setValue("workingTimeMethod", "time_shifts");
    if (
      values.targetUnit !== "" &&
      !(TARGET_UNITS_BY_BASIS[basis] as readonly string[]).includes(
        values.targetUnit,
      )
    )
      form.setValue("targetUnit", "");
  }, [basis, values.workingTimeMethod, values.targetUnit, form]);

  const photoUrl =
    photo.kind === "set"
      ? pickedUrl
      : photo.kind === "remove"
        ? null
        : (equipment?.photo?.thumbnailUrl ?? null);

  const submit = async (input: Values) => {
    setFormError(undefined);
    if (input.ownership === "rented" && seeRates) {
      if (!isRupees(input.hireRate)) {
        form.setError("hireRate", { message: "Enter the hire rate." });
        return;
      }
    }
    if (equipment == null && fixedProjectId == null && input.place === "") {
      form.setError("place", { message: "Choose where it is." });
      return;
    }
    const isRented = input.ownership === "rented";
    const body = {
      ownership: input.ownership,
      name: input.name.trim(),
      equipmentNumber: input.equipmentNumber.trim(),
      purchaseYear:
        isRented || input.purchaseYear.trim() === ""
          ? null
          : Number(input.purchaseYear),
      fuelType: optional(input.fuelType) as (typeof FUEL_TYPES)[number] | null,
      fuelUnit: optional(input.fuelUnit) as (typeof FUEL_UNITS)[number] | null,
      utilisationBasis: input.utilisationBasis,
      workingTimeMethod: input.workingTimeMethod,
      targetValue: optional(input.targetValue),
      targetUnit:
        input.targetValue.trim() === ""
          ? null
          : (optional(input.targetUnit) as
              (typeof TARGET_UNITS_BY_BASIS)["hourly"][number] | null),
      minUtilisationPct: optional(input.minUtilisationPct),
      expectedFuelEfficiency: optional(input.expectedFuelEfficiency),
      contactPersonName: optional(input.contactPersonName),
      contactPersonNumber: optional(input.contactPersonNumber),
      companyName: optional(input.companyName),
      hirePartyId: isRented ? optional(input.hirePartyId) : null,
      hireBasis: isRented
        ? (optional(input.hireBasis) as (typeof HIRE_BASES)[number] | null)
        : null,
      idleChargeable: isRented && input.idleChargeable,
      ...(seeRates || !isRented
        ? { hireRate: isRented ? rupeesToPaise(input.hireRate) : null }
        : {}),
    };
    try {
      setSaving("Saving…");
      let saved =
        equipment == null
          ? await create.mutateAsync({
              ...body,
              projectId:
                fixedProjectId ??
                (input.place === WAREHOUSE ? null : input.place),
              locationName: optional(input.locationName),
              placedOn: input.placedOn === "" ? null : input.placedOn,
            })
          : await update.mutateAsync({
              ...body,
              expectedUpdatedAt: equipment.updatedAt,
            });
      if (photo.kind !== "keep") {
        setSaving("Saving the photo…");
        try {
          saved =
            photo.kind === "set"
              ? await uploadEquipmentPhoto(saved.id, photo.file)
              : await removeEquipmentPhoto(saved.id);
        } catch {
          // The machine is saved; the photo can be tried again on Edit.
        }
      }
      onSaved(saved);
    } catch (caught) {
      if (caught instanceof QueryHttpError) {
        const field = (caught.details as { field?: unknown } | undefined)
          ?.field;
        if (typeof field === "string" && SERVER_FIELDS.has(field)) {
          form.setError(field as FieldPath<Values>, {
            message: caught.message,
          });
          return;
        }
        setFormError(caught.message);
        return;
      }
      setFormError("Something went wrong. Please try again.");
    } finally {
      setSaving(null);
    }
  };

  const hireParties = options.hireParties.map((party) => ({
    value: party.id,
    label: party.name,
  }));
  // A disabled hire party stays on the machine it is already on.
  if (
    equipment?.hireParty != null &&
    !hireParties.some((party) => party.value === equipment.hireParty?.id)
  )
    hireParties.unshift({
      value: equipment.hireParty.id,
      label: equipment.hireParty.name ?? "A removed Contractor",
    });
  const placeItems = [
    { value: WAREHOUSE, label: WAREHOUSE_LABEL },
    ...options.projects.map((project) => ({
      value: project.id,
      label: project.name,
    })),
  ];
  const fixedProjectName =
    fixedProjectId == null
      ? null
      : (options.projects.find((project) => project.id === fixedProjectId)
          ?.name ?? null);

  const ownershipLabel = (ownership: EquipmentOwnership) =>
    ownership === "owned" ? OWNERSHIP_LABELS.owned : OWNERSHIP_LABELS.rented;

  return (
    <form
      noValidate
      aria-label={
        equipment == null ? "Add Equipment" : `Edit ${equipment.name}`
      }
      className="w-full max-w-4xl space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit(submit)(event);
      }}
    >
      <FormCard icon={<Truck />} title="Equipment type">
        <Controller
          control={form.control}
          name="ownership"
          render={({ field }) => (
            <RadioGroup
              aria-label="Equipment type"
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value as EquipmentOwnership);
              }}
              className="grid gap-3 sm:grid-cols-2"
            >
              {(["owned", "rented"] as const).map((ownership) => (
                <div
                  key={ownership}
                  className="flex items-start gap-2 rounded-lg border p-3"
                >
                  <RadioGroupItem
                    id={`equipment-${ownership}`}
                    value={ownership}
                    disabled={ownership === "rented" && rentedLocked}
                  />
                  <div className="space-y-0.5">
                    <Label
                      htmlFor={`equipment-${ownership}`}
                      className="font-medium"
                    >
                      {ownershipLabel(ownership)}
                    </Label>
                    <p className="text-muted-foreground text-xs">
                      {ownership === "owned"
                        ? "The Company's own machine."
                        : rentedLocked
                          ? "Adding rented equipment needs Financial on Equipments, for its hire rate."
                          : "Hired from a Contractor at a rate."}
                    </p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          )}
        />
      </FormCard>

      <FormCard icon={<IdCard />} title="Identity">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="equipment-name">Equipment Name</Label>
            <Input
              id="equipment-name"
              autoComplete="off"
              placeholder="JCB 3DX"
              aria-invalid={errors.name != null}
              {...form.register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="equipment-number">Equipment Number</Label>
            <Input
              id="equipment-number"
              autoComplete="off"
              placeholder="TN-09-AB-1234"
              aria-invalid={errors.equipmentNumber != null}
              {...form.register("equipmentNumber")}
            />
            <FieldError message={errors.equipmentNumber?.message} />
          </div>
          {!rented && (
            <div className="space-y-1.5">
              <Label htmlFor="equipment-year">Purchase Year</Label>
              <Input
                id="equipment-year"
                inputMode="numeric"
                autoComplete="off"
                placeholder={String(THIS_YEAR)}
                aria-invalid={errors.purchaseYear != null}
                {...form.register("purchaseYear")}
              />
              <FieldError message={errors.purchaseYear?.message} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="equipment-contact">Contact Person</Label>
            <Input
              id="equipment-contact"
              autoComplete="off"
              aria-invalid={errors.contactPersonName != null}
              {...form.register("contactPersonName")}
            />
            <FieldError message={errors.contactPersonName?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="equipment-contact-number">Contact Number</Label>
            <Input
              id="equipment-contact-number"
              inputMode="tel"
              autoComplete="off"
              aria-invalid={errors.contactPersonNumber != null}
              {...form.register("contactPersonNumber")}
            />
            <FieldError message={errors.contactPersonNumber?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="equipment-company">Company Name</Label>
            <Input
              id="equipment-company"
              autoComplete="off"
              aria-invalid={errors.companyName != null}
              {...form.register("companyName")}
            />
            <FieldError message={errors.companyName?.message} />
          </div>
          {canChangePhoto && (
            <div className="space-y-3 border-t pt-4 sm:col-span-2">
              <h3 className="text-sm font-medium">Equipment Photo</h3>
              <ImageUploader
                kind="equipment_photo"
                noun="photo"
                shape="square"
                imageUrl={photoUrl}
                fallback={<Truck aria-hidden="true" />}
                hint="PNG, JPEG or WebP, up to 5 MB. Saved with the equipment."
                disabled={saving != null}
                onUpload={(file) => {
                  setPhoto({ kind: "set", file });
                  return Promise.resolve();
                }}
                onRemove={() => {
                  setPhoto(
                    equipment?.photo == null
                      ? { kind: "keep" }
                      : { kind: "remove" },
                  );
                  return Promise.resolve();
                }}
              />
            </div>
          )}
        </div>
      </FormCard>

      <FormCard icon={<Fuel />} title="Fuel">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <SelectField
              control={form.control}
              name="fuelType"
              id="equipment-fuel-type"
              label="Fuel Type"
              placeholder="Not set"
              invalid={false}
              items={[
                { value: NONE, label: "Not set" },
                ...FUEL_TYPES.map((type) => ({
                  value: type,
                  label: FUEL_TYPE_LABELS[type],
                })),
              ]}
            />
          </div>
          <div>
            <SelectField
              control={form.control}
              name="fuelUnit"
              id="equipment-fuel-unit"
              label="Fuel Unit"
              placeholder="Not set"
              invalid={false}
              items={[
                { value: NONE, label: "Not set" },
                ...FUEL_UNITS.map((unit) => ({
                  value: unit,
                  label: FUEL_UNIT_LABELS[unit],
                })),
              ]}
            />
          </div>
        </div>
      </FormCard>

      <FormCard icon={<Gauge />} title="Utilisation">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <SelectField
              control={form.control}
              name="utilisationBasis"
              id="equipment-basis"
              label="Utilisation Basis"
              placeholder="Choose"
              invalid={errors.utilisationBasis != null}
              items={UTILISATION_BASES.map((item) => ({
                value: item,
                label: UTILISATION_BASIS_LABELS[item],
              }))}
            />
          </div>
          <div>
            <SelectField
              control={form.control}
              name="workingTimeMethod"
              id="equipment-method"
              label="Working Time Method"
              placeholder="Choose"
              invalid={errors.workingTimeMethod != null}
              items={workingTimeMethodsFor(basis).map((item) => ({
                value: item,
                label: WORKING_TIME_METHOD_LABELS[item],
              }))}
            />
            <FieldError message={errors.workingTimeMethod?.message} />
          </div>
        </div>
      </FormCard>

      <FormCard icon={<Target />} title="Target & Performance">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="equipment-target">Target</Label>
            <Input
              id="equipment-target"
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={errors.targetValue != null}
              {...form.register("targetValue")}
            />
            <FieldError message={errors.targetValue?.message} />
          </div>
          <div>
            <SelectField
              control={form.control}
              name="targetUnit"
              id="equipment-target-unit"
              label="Target Unit"
              placeholder="Choose"
              invalid={errors.targetUnit != null}
              items={TARGET_UNITS_BY_BASIS[basis].map((unit) => ({
                value: unit,
                label: TARGET_UNIT_LABELS[unit],
              }))}
            />
            <FieldError message={errors.targetUnit?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="equipment-min-utilisation">
              Min Utilisation (%)
            </Label>
            <Input
              id="equipment-min-utilisation"
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={errors.minUtilisationPct != null}
              {...form.register("minUtilisationPct")}
            />
            <FieldError message={errors.minUtilisationPct?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="equipment-efficiency">
              Expected Fuel Efficiency (per{" "}
              {{ hourly: "hour", km: "km", trip: "trip" }[basis]})
            </Label>
            <Input
              id="equipment-efficiency"
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={errors.expectedFuelEfficiency != null}
              {...form.register("expectedFuelEfficiency")}
            />
            <FieldError message={errors.expectedFuelEfficiency?.message} />
          </div>
        </div>
      </FormCard>

      {rented && (
        <FormCard icon={<HandCoins />} title="Hire details">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <SelectField
                control={form.control}
                name="hirePartyId"
                id="equipment-hire-party"
                label="Hired from (Contractor)"
                placeholder="Choose a Contractor"
                invalid={errors.hirePartyId != null}
                items={hireParties}
              />
              <FieldError message={errors.hirePartyId?.message} />
            </div>
            <div>
              <SelectField
                control={form.control}
                name="hireBasis"
                id="equipment-hire-basis"
                label="Hire Basis"
                placeholder="Choose"
                invalid={errors.hireBasis != null}
                items={HIRE_BASES.map((item) => ({
                  value: item,
                  label: HIRE_BASIS_LABELS[item],
                }))}
              />
              <FieldError message={errors.hireBasis?.message} />
            </div>
            {seeRates && (
              <div className="space-y-1.5">
                <Label htmlFor="equipment-hire-rate">Rate</Label>
                <MoneyInput
                  id="equipment-hire-rate"
                  aria-invalid={errors.hireRate != null}
                  {...form.register("hireRate")}
                />
                <FieldError message={errors.hireRate?.message} />
              </div>
            )}
            <Controller
              control={form.control}
              name="idleChargeable"
              render={({ field }) => (
                <div className="flex items-start gap-3 sm:col-span-2">
                  <Switch
                    id="equipment-chargeable"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-describedby="equipment-chargeable-hint"
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="equipment-chargeable">Chargeable</Label>
                    <p
                      id="equipment-chargeable-hint"
                      className="text-muted-foreground text-xs"
                    >
                      Idle hours count towards an hourly hire.
                    </p>
                  </div>
                </div>
              )}
            />
          </div>
        </FormCard>
      )}

      {equipment == null && (
        <FormCard icon={<MapPin />} title="Where it is">
          <div className="grid gap-4 sm:grid-cols-3">
            {fixedProjectId == null ? (
              <div>
                <SelectField
                  control={form.control}
                  name="place"
                  id="equipment-place"
                  label="Project or Warehouse"
                  placeholder="Choose"
                  invalid={errors.place != null}
                  items={placeItems}
                />
                <FieldError message={errors.place?.message} />
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Project</p>
                <p className="text-sm">{fixedProjectName ?? "This Project"}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="equipment-location">Location Name</Label>
              <Input
                id="equipment-location"
                autoComplete="off"
                placeholder="Block C yard"
                aria-invalid={errors.locationName != null}
                {...form.register("locationName")}
              />
              <FieldError message={errors.locationName?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="equipment-placed-on">Placed on</Label>
              <Input
                id="equipment-placed-on"
                type="date"
                max={localToday()}
                aria-invalid={errors.placedOn != null}
                {...form.register("placedOn")}
              />
              <FieldError message={errors.placedOn?.message} />
            </div>
          </div>
        </FormCard>
      )}

      <FormAlert message={formError} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving != null}>
          {saving ?? "Save"}
        </Button>
      </div>
    </form>
  );
}

/** The add / edit page around the form. */
export function EquipmentFormScreen({
  equipment,
  fixedProjectId,
  backHref,
  hrefFor,
}: {
  equipment?: EquipmentDetail;
  fixedProjectId?: string;
  backHref: string;
  hrefFor: (id: string) => string;
}) {
  const router = useRouter();
  return (
    <EquipmentForm
      equipment={equipment}
      fixedProjectId={fixedProjectId ?? null}
      onSaved={(saved) => {
        router.push(hrefFor(saved.id));
      }}
      onCancel={() => {
        router.push(backHref);
      }}
    />
  );
}
