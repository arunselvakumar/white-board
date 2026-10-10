"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { BRANCH_LIMITS, type BranchKind } from "@/src/hrms/domain/branch";
import {
  HRMS_BRANCHES_KEY,
  createHrmsBranch,
  hrmsProjectSitesQuery,
  updateHrmsBranch,
  type HrmsBranch,
} from "@/src/queries/hrms-branches";

import { FenceMapPicker, coordinate } from "./fence-map-picker";

const COORDINATE = /^-?\d{1,3}(\.\d+)?$/;

const schema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter a name")
      .max(BRANCH_LIMITS.maxNameLength, "Use at most 80 characters"),
    address: z.string().trim().max(BRANCH_LIMITS.maxAddressLength),
    projectId: z.string(),
    latitude: z.string().trim(),
    longitude: z.string().trim(),
    radiusMetres: z.string().trim(),
  })
  .superRefine((values, context) => {
    const latitude = coordinate(values.latitude);
    if (
      !COORDINATE.test(values.latitude) ||
      latitude == null ||
      latitude < -90 ||
      latitude > 90
    )
      context.addIssue({
        code: "custom",
        path: ["latitude"],
        message: "Enter a latitude from -90 to 90",
      });
    const longitude = coordinate(values.longitude);
    if (
      !COORDINATE.test(values.longitude) ||
      longitude == null ||
      longitude < -180 ||
      longitude > 180
    )
      context.addIssue({
        code: "custom",
        path: ["longitude"],
        message: "Enter a longitude from -180 to 180",
      });
    const radius = Number(values.radiusMetres);
    if (
      !/^\d+$/.test(values.radiusMetres) ||
      radius < BRANCH_LIMITS.minRadiusMetres ||
      radius > BRANCH_LIMITS.maxRadiusMetres
    )
      context.addIssue({
        code: "custom",
        path: ["radiusMetres"],
        message: "Use 25 to 5,000 whole metres",
      });
  });

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  BRANCH_NAME_REQUIRED: "name",
  BRANCH_NAME_TOO_LONG: "name",
  BRANCH_NAME_TAKEN: "name",
  BRANCH_ADDRESS_TOO_LONG: "address",
  BRANCH_PROJECT_REQUIRED: "projectId",
  BRANCH_PROJECT_NOT_FOUND: "projectId",
  PROJECT_SITE_TAKEN: "projectId",
  BRANCH_LATITUDE_INVALID: "latitude",
  BRANCH_LONGITUDE_INVALID: "longitude",
  BRANCH_RADIUS_INVALID: "radiusMetres",
};

function toValues(branch: HrmsBranch | null): Values {
  return {
    name: branch?.name ?? "",
    address: branch?.address ?? "",
    projectId: branch?.projectId ?? "",
    latitude: branch == null ? "" : branch.latitude.toFixed(6),
    longitude: branch == null ? "" : branch.longitude.toFixed(6),
    radiusMetres: String(branch?.radiusMetres ?? 100),
  };
}

/**
 * New or edit an office branch or a Project site fence (CM-304): name (or
 * site label), the Project for a site, and where the fence is.
 */
export function BranchDialog({
  kind,
  branch,
  onClose,
  showMap = true,
}: {
  kind: BranchKind;
  /** Null to add. */
  branch: HrmsBranch | null;
  onClose: () => void;
  showMap?: boolean;
}) {
  const site = kind === "project_site";
  const queryClient = useQueryClient();
  const sites = useQuery({ ...hrmsProjectSitesQuery, enabled: site });
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(branch),
  });
  const errors = form.formState.errors;
  const [latitude, longitude, radiusMetres] = useWatch({
    control: form.control,
    name: ["latitude", "longitude", "radiusMetres"],
  });
  const save = useMutation({
    mutationFn: (values: Values) => {
      const body = {
        name: values.name,
        address: values.address === "" ? null : values.address,
        projectId: site ? values.projectId : null,
        latitude: Number(values.latitude),
        longitude: Number(values.longitude),
        radiusMetres: Number(values.radiusMetres),
      };
      return branch == null
        ? createHrmsBranch({ kind, ...body })
        : updateHrmsBranch(branch.id, {
            ...body,
            expectedUpdatedAt: branch.updatedAt,
          });
    },
  });

  // Projects without a fence, and the one this fence is on.
  const projectItems = (sites.data?.items ?? [])
    .filter(
      (item) => item.fence == null || item.project.id === branch?.projectId,
    )
    .map((item) => ({ value: item.project.id, label: item.project.name }));

  const submit = form.handleSubmit(async (values) => {
    if (site && values.projectId === "") {
      form.setError("projectId", { message: "Choose the Project" });
      return;
    }
    try {
      await save.mutateAsync(values);
      await queryClient.invalidateQueries({ queryKey: HRMS_BRANCHES_KEY });
      onClose();
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  });

  const title =
    branch == null
      ? site
        ? "New Project site fence"
        : "New Office Branch"
      : `Edit ${branch.name}`;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <form
          noValidate
          className="space-y-5"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {site
                ? "Team Members on this Project can check in inside this fence."
                : "Team Members linked to this branch, or linked to none, can check in inside this fence."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {site ? (
              <div className="space-y-1.5">
                <Label htmlFor="branch-project">Project</Label>
                <Controller
                  name="projectId"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      items={projectItems}
                      value={field.value === "" ? null : field.value}
                      onValueChange={(value) => {
                        if (value != null) field.onChange(value);
                      }}
                    >
                      <SelectTrigger
                        id="branch-project"
                        size="lg"
                        className="w-full min-w-0"
                        aria-invalid={errors.projectId != null}
                      >
                        <SelectValue placeholder="Choose a Project" />
                      </SelectTrigger>
                      <SelectContent
                        align="start"
                        alignItemWithTrigger={false}
                        aria-label="Projects"
                      >
                        {projectItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {sites.isSuccess && projectItems.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    Every Project already has a site fence.
                  </p>
                ) : null}
                <FieldError message={errors.projectId?.message} />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="branch-name">
                {site ? "Site label" : "Branch name"}
              </Label>
              <Input
                id="branch-name"
                className="h-10"
                autoComplete="off"
                placeholder={site ? "Main gate" : "Chennai Head Office"}
                aria-invalid={errors.name != null}
                {...form.register("name")}
              />
              <FieldError message={errors.name?.message} />
            </div>
            <div className={site ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
              <Label htmlFor="branch-address">Address (optional)</Label>
              <Input
                id="branch-address"
                className="h-10"
                autoComplete="off"
                aria-invalid={errors.address != null}
                {...form.register("address")}
              />
              <FieldError message={errors.address?.message} />
            </div>
          </div>
          <FenceMapPicker
            showMap={showMap}
            value={{ latitude, longitude, radiusMetres }}
            errors={{
              latitude: errors.latitude?.message,
              longitude: errors.longitude?.message,
              radiusMetres: errors.radiusMetres?.message,
            }}
            onChange={(next) => {
              for (const [key, value] of Object.entries(next))
                form.setValue(key as keyof Values, value, {
                  shouldDirty: true,
                  shouldValidate: form.formState.isSubmitted,
                });
            }}
          />
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save fence"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
