"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, MapPin, MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { ConfirmDeleteDialog } from "@/components/masters/master-list-parts";
import { fieldForCode } from "@/lib/server-errors";
import {
  LOCATION_DESCRIPTION_MAX,
  LOCATION_NAME_MAX,
} from "@/src/projects/domain/location";
import {
  locationsQuery,
  useLocationCommand,
  type ProjectLocation,
} from "@/src/queries/project-structure";

import { SectionHeader, StructureEmpty, saveProblem } from "./structure-parts";

/** What a Team Member may do here; reading is a given on this screen. */
export type LocationsAccess = {
  create: boolean;
  update: boolean;
  delete: boolean;
};

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the Location name")
    .max(
      LOCATION_NAME_MAX,
      `Use at most ${String(LOCATION_NAME_MAX)} characters`,
    ),
  description: z
    .string()
    .trim()
    .max(
      LOCATION_DESCRIPTION_MAX,
      `Use at most ${String(LOCATION_DESCRIPTION_MAX)} characters`,
    ),
});

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  LOCATION_NAME_REQUIRED: "name",
  LOCATION_NAME_TOO_LONG: "name",
  LOCATION_NAME_IN_USE: "name",
  LOCATION_DESCRIPTION_TOO_LONG: "description",
};

/** Add a Location, or edit one with the `updatedAt` it loaded. */
export function LocationDialog({
  projectId,
  location,
  onClose,
}: {
  projectId: string;
  /** Null to add. */
  location: ProjectLocation | null;
  onClose: () => void;
}) {
  const command = useLocationCommand(projectId);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: location?.name ?? "",
      description: location?.description ?? "",
    },
  });
  const errors = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    const input = {
      name: values.name,
      description: values.description === "" ? null : values.description,
    };
    try {
      await command.mutateAsync(
        location == null
          ? { kind: "create", input }
          : {
              kind: "update",
              id: location.id,
              input: { ...input, expectedUpdatedAt: location.updatedAt },
            },
      );
      onClose();
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="space-y-5"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle className="break-words">
              {location == null ? "Add Location" : `Edit ${location.name}`}
            </DialogTitle>
            <DialogDescription>
              A stretch or structure on this Project that site entries can name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="location-name">Location name</Label>
            <Input
              id="location-name"
              className="h-10"
              autoComplete="off"
              placeholder="Chainage 0+000 – 2+500"
              aria-invalid={errors.name != null}
              {...form.register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="location-description">
              Description
              <span className="text-muted-foreground font-normal">
                {" "}
                (optional)
              </span>
            </Label>
            <Textarea
              id="location-description"
              rows={3}
              placeholder="Box culvert near the toll plaza"
              aria-invalid={errors.description != null}
              {...form.register("description")}
            />
            <FieldError message={errors.description?.message} />
          </div>
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={command.isPending}>
              {command.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The Locations screen (CM-405): the named places of a non-building
 * Project in the Team Member's order. Add, edit, move up / down and delete
 * follow the `projects.locations` flags.
 */
export function LocationsPage({
  projectId,
  access,
}: {
  projectId: string;
  access: LocationsAccess;
}) {
  const { data } = useSuspenseQuery(locationsQuery(projectId));
  const command = useLocationCommand(projectId);
  const [editing, setEditing] = useState<ProjectLocation | "new" | null>(null);
  const [deleting, setDeleting] = useState<ProjectLocation | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [listError, setListError] = useState<string | undefined>();
  const items = data.items;

  const addButton = (
    <Button
      type="button"
      onClick={() => {
        setEditing("new");
      }}
    >
      <Plus aria-hidden="true" />
      Add Location
    </Button>
  );

  const move = (location: ProjectLocation, direction: "up" | "down") => {
    setListError(undefined);
    command.mutate(
      { kind: "move", id: location.id, direction },
      {
        onError: (error) => {
          setListError(saveProblem(error).message);
        },
      },
    );
  };

  return (
    <div className="w-full max-w-5xl space-y-5 p-6">
      <SectionHeader
        title="Locations"
        meta={
          items.length === 0
            ? undefined
            : items.length === 1
              ? "1 Location"
              : `${String(items.length)} Locations`
        }
        actions={access.create && items.length > 0 ? addButton : null}
      />
      {items.length === 0 ? (
        <StructureEmpty
          icon={MapPin}
          title={
            access.create
              ? "Name the places on this Project"
              : "No Locations on this Project yet"
          }
          description={
            access.create
              ? "For roads, pipelines and other work without Wings: add stretches and structures such as “Chainage 0+000 – 2+500” or “Culvert C3”."
              : "Stretches and structures of this Project show here once they are added."
          }
          action={access.create ? addButton : undefined}
        />
      ) : (
        <>
          <FormAlert message={listError} />
          <ol
            aria-label="Locations"
            className="bg-card divide-y rounded-xl border"
          >
            {items.map((location, index) => (
              <li
                key={location.id}
                className="flex items-center gap-2 px-3 py-3 sm:px-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{location.name}</p>
                  {location.description == null ? null : (
                    <p className="text-muted-foreground line-clamp-2 text-sm break-words">
                      {location.description}
                    </p>
                  )}
                </div>
                {access.update ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Move ${location.name} up`}
                      disabled={index === 0 || command.isPending}
                      onClick={() => {
                        move(location, "up");
                      }}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Move ${location.name} down`}
                      disabled={index === items.length - 1 || command.isPending}
                      onClick={() => {
                        move(location, "down");
                      }}
                    >
                      <ArrowDown />
                    </Button>
                  </>
                ) : null}
                {access.update || access.delete ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${location.name}`}
                        />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      {access.update ? (
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(location);
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
                      ) : null}
                      {access.delete ? (
                        <>
                          {access.update ? <DropdownMenuSeparator /> : null}
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => {
                              setDeleteError(undefined);
                              setDeleting(location);
                            }}
                          >
                            Delete
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </li>
            ))}
          </ol>
        </>
      )}
      {editing == null ? null : (
        <LocationDialog
          projectId={projectId}
          location={editing === "new" ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
      <ConfirmDeleteDialog
        name={deleting?.name ?? null}
        description="Site entries can no longer name it. It goes for everyone."
        error={deleteError}
        pending={command.isPending}
        onClose={() => {
          setDeleting(null);
        }}
        onConfirm={() => {
          if (deleting == null) return;
          command.mutate(
            { kind: "delete", id: deleting.id },
            {
              onSuccess: () => {
                setDeleting(null);
              },
              onError: (error) => {
                setDeleteError(saveProblem(error).message);
              },
            },
          );
        }}
      />
    </div>
  );
}
